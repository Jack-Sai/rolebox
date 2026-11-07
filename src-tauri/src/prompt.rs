use crate::models::{Character, GroupMessage, Message, UserPersona};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// 整个项目最关键的模块（铁律一）：system prompt 在会话生命周期内必须前缀字节级不变。
// 因此这里禁止出现时间、随机数、记忆注入、动态提醒等任何会随调用变化的内容。
// 模板逐字对应 DESIGN 5.5.1，且与前端 lib/prompt.ts 的只读预览保持一致。

pub fn build_single_system_prompt(
    character: &Character,
    scenario: &str,
    user_persona: Option<&UserPersona>,
) -> String {
    // 空值用固定占位，保持结构稳定；不要因为"没填"就整段省略。
    let scenario_text = if scenario.trim().is_empty() {
        "（未指定）"
    } else {
        scenario
    };
    let user_text = user_persona
        .map(|persona| persona.persona.trim())
        .filter(|text| !text.is_empty())
        .unwrap_or("（用户未指定身份）");

    [
        format!("【身份】你是{}，{}。", character.name, character.tagline),
        format!(
            "你只扮演{}，绝对不要替用户说话，不要描写用户的动作和心理。",
            character.name
        ),
        String::new(),
        "【完整设定】".to_string(),
        character.persona.clone(),
        String::new(),
        "【场景】".to_string(),
        scenario_text.to_string(),
        String::new(),
        "【用户】".to_string(),
        user_text.to_string(),
        String::new(),
        "【纪律约束】".to_string(),
        "- 严禁输出思考过程、推理痕迹、meta 说明或任何非角色内容，不要使用任何思考标签".to_string(),
        "- 不得主动发起对话，仅在用户输入后回应".to_string(),
        "- 始终保持角色人设，不得以模型或助手身份自述".to_string(),
        "- 回复简洁，控制在适当长度，避免冗长".to_string(),
        String::new(),
        "【格式规则】".to_string(),
        "- 你的所有发言直接书写，不要加 [角色名]: 前缀".to_string(),
        "- 动作、神态、心理用圆括号（）描写".to_string(),
        "- 不输出思考过程，不输出任何 meta 说明或旁白".to_string(),
    ]
    .join("\n")
}

/// 发给模型的消息。定义在 prompt.rs 而非 provider.rs，是因为 C11 先于 C12；
/// provider.rs 用 `pub use crate::prompt::ChatMessage` 重导出，对外路径不变。
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

/// 把单人会话的历史转成 messages 数组。铁律一：历史只追加、不改写，
/// 因此同一份输入两次调用必须产出字节完全一致的输出。
pub fn format_single_history(
    system_prompt: &str,
    messages: &[Message],
    character_name: &str,
    user_name: &str,
) -> Vec<ChatMessage> {
    // 单人会话只有一个角色和一个用户，OpenAI 的 role 已能区分发言人；
    // 加名字前缀既浪费 token，又容易和内容里的方括号混淆（DESIGN 5.5.3）。
    let _ = (character_name, user_name);

    let mut result = vec![ChatMessage {
        role: "system".into(),
        content: system_prompt.to_string(),
    }];

    // 摘要消息物理 id 最大（AUTOINCREMENT 无法插中间），语义上却属于会话开头；
    // 构造上下文时移到 system 之后、其他消息之前（DESIGN 10.2 修正）。
    for message in messages
        .iter()
        .filter(|item| item.role == "summary" && !item.summarized)
    {
        result.push(ChatMessage {
            role: "system".into(),
            content: format!("[对话摘要]\n{}", message.content),
        });
    }

    for message in messages
        .iter()
        .filter(|item| item.role != "summary" && !item.summarized)
    {
        let (role, content) = match message.role.as_str() {
            // OpenAI 兼容接口只认三种 role，旁白不能用自定义 role（dev.md 坑 #24）。
            "narration" => ("user", format!("【旁白】{}", message.content)),
            "user" => ("user", message.content.clone()),
            "assistant" => ("assistant", message.content.clone()),
            _ => continue,
        };
        result.push(ChatMessage {
            role: role.to_string(),
            content,
        });
    }

    result
}

/// 群聊 system prompt（DESIGN 5.5.2）。同样在会话创建时定稿，之后一个字节不改。
pub fn build_group_system_prompt(
    members: &[(Character, String)],
    scenario: &str,
    user_persona: Option<&UserPersona>,
) -> String {
    let scenario_text = if scenario.trim().is_empty() {
        "（未指定）"
    } else {
        scenario
    };
    let user_text = user_persona
        .map(|persona| persona.persona.trim())
        .filter(|text| !text.is_empty())
        .unwrap_or("（用户未指定身份）");
    let user_name = user_persona
        .map(|persona| persona.name.trim())
        .filter(|name| !name.is_empty())
        .unwrap_or("用户");

    let mut lines: Vec<String> = Vec::new();
    lines.push("【身份】你正在参与一个多角色角色扮演。参与者：".to_string());
    for (character, intro) in members {
        lines.push(format!("- {}：{}", character.name, intro));
    }
    lines.push(format!("- 用户：{user_name}"));
    lines.push(String::new());

    lines.push("【角色设定】".to_string());
    for (character, _) in members {
        lines.push(format!("【{}】", character.name));
        lines.push(character.persona.clone());
        lines.push(String::new());
    }

    lines.push("【场景】".to_string());
    lines.push(scenario_text.to_string());
    lines.push(String::new());
    lines.push("【用户】".to_string());
    lines.push(user_text.to_string());
    lines.push(String::new());

    lines.push("【规则】".to_string());
    for rule in [
        "- 每次只扮演被指定的一个角色，只输出该角色的台词和动作",
        "- 你的发言会被加上 [角色名]: 前缀，所以你**不要**自己加前缀",
        "- 动作、神态、心理用圆括号（）描写",
        "- 你可以回应其他角色，也可以只回应用户",
        "- 绝对不要替用户或其他角色说话",
        "- 不输出思考过程，不输出任何 meta 说明或旁白，不要使用任何思考标签",
        "- 回复简洁，控制在适当长度，避免冗长",
    ] {
        lines.push(rule.to_string());
    }

    lines.join("\n")
}

/// 群聊历史（DESIGN 5.5.4）：assistant 与 user 都要加名字前缀，否则模型分不清谁在说。
pub fn format_group_history(
    system_prompt: &str,
    messages: &[GroupMessage],
    members: &HashMap<i64, String>,
    user_name: &str,
) -> Vec<ChatMessage> {
    let mut result = vec![ChatMessage {
        role: "system".into(),
        content: system_prompt.to_string(),
    }];

    for message in messages
        .iter()
        .filter(|item| item.role == "summary" && !item.summarized)
    {
        result.push(ChatMessage {
            role: "system".into(),
            content: format!("[对话摘要]\n{}", message.content),
        });
    }

    for message in messages
        .iter()
        .filter(|item| item.role != "summary" && !item.summarized)
    {
        let (role, content) = match message.role.as_str() {
            "narration" => ("user", format!("【旁白】{}", message.content)),
            "user" => ("user", format!("[{user_name}]: {}", message.content)),
            "assistant" => {
                let name = message
                    .character_id
                    .and_then(|id| members.get(&id))
                    .map(String::as_str)
                    .unwrap_or("未知角色");
                ("assistant", format!("[{name}]: {}", message.content))
            }
            _ => continue,
        };
        result.push(ChatMessage {
            role: role.to_string(),
            content,
        });
    }

    result
}

/// 模型可能不听话，输出 `[林月]: （挥手）嗨`。只清理**开头**匹配 expected_name 的前缀，
/// 中间的 `[xxx]:` 保留 —— 那可能是台词内容的一部分（DESIGN 5.5.6）。
pub fn strip_role_prefix(content: &str, expected_name: &str) -> String {
    let trimmed = content.trim_start();

    // 形式一：[名字]: / [名字]：
    if let Some(rest) = trimmed.strip_prefix('[') {
        if let Some(end) = rest.find(']') {
            let name = &rest[..end];
            if !name.is_empty() && name == expected_name {
                let after = &rest[end + 1..];
                if let Some(text) = after
                    .strip_prefix(':')
                    .or_else(|| after.strip_prefix('：'))
                {
                    return text.trim_start().to_string();
                }
            }
        }
    }

    // 形式二：名字: / 名字：
    if let Some(after) = trimmed.strip_prefix(expected_name) {
        if let Some(text) = after
            .strip_prefix(':')
            .or_else(|| after.strip_prefix('：'))
        {
            return text.trim_start().to_string();
        }
    }

    trimmed.to_string()
}

/// 当前轮的发言指示（DESIGN 5.5.5）：只加在末尾，不存储、不进历史。
pub fn append_turn_instruction(messages: &mut Vec<ChatMessage>, speaker_name: &str) {
    messages.push(ChatMessage {
        role: "user".into(),
        content: format!(
            "现在请扮演 {speaker_name} 发言。只输出 {speaker_name} 的台词和动作，不要加 [角色名]: 前缀，不要替其他角色或用户说话。"
        ),
    });
}

/// 摘要 prompt（DESIGN 5.5.7）。入参是 (显示名, 内容) —— 调用方负责把
/// assistant 映射成角色名、narration 映射成「旁白」，这样摘要也能看懂谁说了什么。
pub const SUMMARY_SYSTEM_PROMPT: &str = "你是一个对话摘要助手。请将以下对话压缩成 200 字以内的摘要，保留关键剧情、人物关系变化、重要设定。只输出摘要正文，不要任何前言。";

pub fn build_summary_prompt(messages: &[(String, String)]) -> Vec<ChatMessage> {
    let body = messages
        .iter()
        .map(|(name, content)| format!("[{name}]: {content}"))
        .collect::<Vec<_>>()
        .join("\n");

    vec![
        ChatMessage {
            role: "system".into(),
            content: SUMMARY_SYSTEM_PROMPT.to_string(),
        },
        ChatMessage {
            role: "user".into(),
            content: body,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Message;

    fn character() -> Character {
        Character {
            id: 1,
            name: "甲".into(),
            tagline: "一句话".into(),
            persona: "完整设定".into(),
            avatar_color: "#abcdef".into(),
            created_at: "2026-11-07 00:00:00".into(),
        }
    }

    fn persona() -> UserPersona {
        UserPersona {
            id: 2,
            name: "用户分身".into(),
            persona: "用户身份设定".into(),
        }
    }

    /// 与前端 lib/prompt.test.ts 使用同一份期望字符串，防止两边模板漂移。
    const EXPECTED_EMPTY: &str = "【身份】你是甲，一句话。\n\
你只扮演甲，绝对不要替用户说话，不要描写用户的动作和心理。\n\
\n\
【完整设定】\n\
完整设定\n\
\n\
【场景】\n\
（未指定）\n\
\n\
【用户】\n\
（用户未指定身份）\n\
\n\
【纪律约束】\n\
- 严禁输出思考过程、推理痕迹、meta 说明或任何非角色内容，不要使用任何思考标签\n\
- 不得主动发起对话，仅在用户输入后回应\n\
- 始终保持角色人设，不得以模型或助手身份自述\n\
- 回复简洁，控制在适当长度，避免冗长\n\
\n\
【格式规则】\n\
- 你的所有发言直接书写，不要加 [角色名]: 前缀\n\
- 动作、神态、心理用圆括号（）描写\n\
- 不输出思考过程，不输出任何 meta 说明或旁白";

    #[test]
    fn single_system_prompt_matches_design_template_exactly() {
        assert_eq!(
            build_single_system_prompt(&character(), "", None),
            EXPECTED_EMPTY
        );
    }

    #[test]
    fn same_input_produces_byte_identical_output() {
        let first = build_single_system_prompt(&character(), "雨夜", Some(&persona()));
        let second = build_single_system_prompt(&character(), "雨夜", Some(&persona()));
        assert_eq!(first.as_bytes(), second.as_bytes());
    }

    #[test]
    fn empty_scenario_and_missing_persona_use_fixed_placeholders() {
        let text = build_single_system_prompt(&character(), "   ", None);
        assert!(text.contains("（未指定）"));
        assert!(text.contains("（用户未指定身份）"));
        assert!(text.contains("【格式规则】"));
    }

    #[test]
    fn provided_scenario_and_persona_are_used_verbatim() {
        let text = build_single_system_prompt(&character(), "雨夜", Some(&persona()));
        assert!(text.contains("雨夜"));
        assert!(text.contains("用户身份设定"));
        assert!(!text.contains("（用户未指定身份）"));
    }

    fn message(id: i64, role: &str, content: &str) -> Message {
        Message {
            id,
            session_id: 1,
            role: role.into(),
            content: content.into(),
            version_group: id,
            is_active: true,
            deprecated: false,
            summarized: false,
            created_at: "2026-11-07 00:00:00".into(),
        }
    }

    #[test]
    fn single_history_starts_with_system_and_never_adds_name_prefixes() {
        let messages = vec![
            message(1, "user", "你好"),
            message(2, "assistant", "（点头）你好。"),
        ];
        let result = format_single_history("SYSTEM", &messages, "甲", "用户");

        assert_eq!(result.len(), 3);
        assert_eq!(result[0].role, "system");
        assert_eq!(result[0].content, "SYSTEM");
        assert_eq!(
            result[1],
            ChatMessage {
                role: "user".into(),
                content: "你好".into(),
            }
        );
        assert_eq!(
            result[2],
            ChatMessage {
                role: "assistant".into(),
                content: "（点头）你好。".into(),
            }
        );
        assert!(!result.iter().any(|item| item.content.contains("[甲]:")));
    }

    #[test]
    fn summary_is_moved_right_after_system() {
        // 摘要物理 id 最大，但语义上属于会话开头。
        let messages = vec![
            message(1, "user", "旧事"),
            message(9, "summary", "这是摘要"),
            message(10, "user", "最近"),
        ];
        let result = format_single_history("SYSTEM", &messages, "甲", "用户");

        assert_eq!(result[1].role, "system");
        assert_eq!(result[1].content, "[对话摘要]\n这是摘要");
        assert_eq!(result[2].content, "旧事");
        assert_eq!(result[3].content, "最近");
    }

    #[test]
    fn narration_becomes_user_with_narration_prefix() {
        let result = format_single_history(
            "SYSTEM",
            &[message(1, "narration", "窗外下雨了")],
            "甲",
            "用户",
        );

        assert_eq!(result[1].role, "user");
        assert_eq!(result[1].content, "【旁白】窗外下雨了");
    }

    #[test]
    fn summarized_messages_are_skipped() {
        let mut compressed = message(1, "user", "已压缩");
        compressed.summarized = true;
        let messages = vec![compressed, message(2, "user", "保留")];
        let result = format_single_history("SYSTEM", &messages, "甲", "用户");

        assert_eq!(result.len(), 2);
        assert_eq!(result[1].content, "保留");
    }

    #[test]
    fn same_history_produces_byte_identical_output() {
        let messages = vec![
            message(1, "user", "你好"),
            message(2, "assistant", "你好呀"),
            message(3, "narration", "下雨了"),
        ];
        let first =
            serde_json::to_string(&format_single_history("SYSTEM", &messages, "甲", "用户"))
                .unwrap();
        let second =
            serde_json::to_string(&format_single_history("SYSTEM", &messages, "甲", "用户"))
                .unwrap();

        assert_eq!(first.as_bytes(), second.as_bytes());
    }

    #[test]
    fn summary_prompt_has_system_instruction_and_prefixed_body() {
        let prompt = build_summary_prompt(&[
            ("甲".into(), "你好".into()),
            ("旁白".into(), "下雨了".into()),
        ]);

        assert_eq!(prompt.len(), 2);
        assert_eq!(prompt[0].role, "system");
        assert_eq!(prompt[0].content, SUMMARY_SYSTEM_PROMPT);
        assert_eq!(prompt[1].role, "user");
        assert_eq!(prompt[1].content, "[甲]: 你好\n[旁白]: 下雨了");
    }

    #[test]
    fn summary_prompt_keeps_input_order_and_tolerates_empty() {
        let empty = build_summary_prompt(&[]);
        assert_eq!(empty[1].content, "");

        let ordered = build_summary_prompt(&[
            ("乙".into(), "二".into()),
            ("甲".into(), "一".into()),
        ]);
        assert!(ordered[1].content.starts_with("[乙]: 二"));
    }

    fn group_character(id: i64, name: &str, tagline: &str, persona: &str) -> Character {
        Character {
            id,
            name: name.into(),
            tagline: tagline.into(),
            persona: persona.into(),
            avatar_color: "#123456".into(),
            created_at: "2026-11-07 00:00:00".into(),
        }
    }

    fn group_message(
        id: i64,
        character_id: Option<i64>,
        role: &str,
        content: &str,
    ) -> GroupMessage {
        GroupMessage {
            id,
            group_id: 1,
            character_id,
            role: role.into(),
            content: content.into(),
            version_group: id,
            is_active: true,
            deprecated: false,
            summarized: false,
            created_at: "2026-11-07 00:00:00".into(),
        }
    }

    #[test]
    fn group_system_prompt_lists_members_roles_and_rules() {
        let members = vec![
            (group_character(1, "甲", "冷静", "甲的设定"), "冷静".to_string()),
            (group_character(2, "乙", "热情", "乙的设定"), "热情".to_string()),
        ];
        let text = build_group_system_prompt(&members, "雨夜", None);

        assert!(text.contains("- 甲：冷静"));
        assert!(text.contains("- 乙：热情"));
        assert!(text.contains("- 用户：用户"));
        assert!(text.contains("【甲】\n甲的设定"));
        assert!(text.contains("【场景】\n雨夜"));
        assert!(text.contains("（用户未指定身份）"));
        assert!(text.contains("【规则】"));
    }

    #[test]
    fn group_system_prompt_is_byte_stable_with_placeholders() {
        let members = vec![(
            group_character(1, "甲", "冷静", "设定"),
            "冷静".to_string(),
        )];
        let first = build_group_system_prompt(&members, "", None);
        let second = build_group_system_prompt(&members, "", None);

        assert_eq!(first.as_bytes(), second.as_bytes());
        assert!(first.contains("（未指定）"));
    }

    #[test]
    fn group_history_prefixes_both_sides() {
        let mut members = HashMap::new();
        members.insert(1, "甲".to_string());
        let messages = vec![
            group_message(1, None, "user", "你们好"),
            group_message(2, Some(1), "assistant", "（点头）你好"),
        ];

        let result = format_group_history("SYS", &messages, &members, "阿明");

        assert_eq!(result[0].content, "SYS");
        assert_eq!(result[1].content, "[阿明]: 你们好");
        assert_eq!(result[2].content, "[甲]: （点头）你好");
    }

    #[test]
    fn group_history_puts_summary_after_system_and_maps_narration() {
        let members = HashMap::new();
        let messages = vec![
            group_message(1, None, "user", "旧事"),
            group_message(9, None, "summary", "摘要内容"),
            group_message(10, None, "narration", "下雨了"),
        ];

        let result = format_group_history("SYS", &messages, &members, "用户");

        assert_eq!(result[1].role, "system");
        assert_eq!(result[1].content, "[对话摘要]\n摘要内容");
        assert_eq!(result[2].content, "[用户]: 旧事");
        assert_eq!(result[3].content, "【旁白】下雨了");
    }

    #[test]
    fn strip_role_prefix_handles_bracket_and_plain_forms() {
        assert_eq!(strip_role_prefix("[甲]: （挥手）嗨", "甲"), "（挥手）嗨");
        assert_eq!(strip_role_prefix("[甲]：（挥手）嗨", "甲"), "（挥手）嗨");
        assert_eq!(strip_role_prefix("甲: 你好", "甲"), "你好");
        assert_eq!(strip_role_prefix("甲：你好", "甲"), "你好");
        // 别的角色名不清理：可能是台词里引用了别人的发言。
        assert_eq!(strip_role_prefix("[乙]: 你好", "甲"), "[乙]: 你好");
        // 只清理开头，中间的前缀保留。
        assert_eq!(strip_role_prefix("他说[乙]: 好", "甲"), "他说[乙]: 好");
    }

    #[test]
    fn append_turn_instruction_only_touches_the_tail() {
        let mut messages = vec![ChatMessage {
            role: "user".into(),
            content: "历史".into(),
        }];

        append_turn_instruction(&mut messages, "甲");

        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].content, "历史");
        assert_eq!(messages[1].role, "user");
        assert!(messages[1].content.contains("甲"));
        assert!(!messages[1].content.contains("历史"));
    }
}
