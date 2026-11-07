use crate::models::{Character, Message, UserPersona};
use serde::{Deserialize, Serialize};

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
        format!("【身份】你是{}。{}。", character.name, character.tagline),
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
        "【格式规则】".to_string(),
        "- 你的所有发言直接书写，不要加 [角色名]: 前缀".to_string(),
        "- 动作、神态、心理用圆括号（）描写".to_string(),
        "- 电子消息（短信、聊天记录等）用方括号【】表示".to_string(),
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
    const EXPECTED_EMPTY: &str = "【身份】你是甲。一句话。\n\
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
【格式规则】\n\
- 你的所有发言直接书写，不要加 [角色名]: 前缀\n\
- 动作、神态、心理用圆括号（）描写\n\
- 电子消息（短信、聊天记录等）用方括号【】表示\n\
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
}
