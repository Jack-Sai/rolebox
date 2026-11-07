use crate::models::{Character, UserPersona};

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

#[cfg(test)]
mod tests {
    use super::*;

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
}
