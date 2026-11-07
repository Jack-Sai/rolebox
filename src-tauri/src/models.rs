use serde::{Deserialize, Serialize};

// 对外结构字段名保持 snake_case，与 DB 列名和前端 types.ts 一一对应。
// Tauri 命令返回值由 serde 直接序列化，不会自动做 camelCase 转换；
// 只有 StreamEvent / ContextInfo 按 DESIGN 6.1 的契约转成 camelCase。

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Character {
    pub id: i64,
    pub name: String,
    pub tagline: String,
    pub persona: String,
    pub avatar_color: String,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct UserPersona {
    pub id: i64,
    pub name: String,
    pub persona: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Session {
    pub id: i64,
    pub character_id: i64,
    pub title: String,
    pub scenario: String,
    pub user_persona_id: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Message {
    pub id: i64,
    pub session_id: i64,
    /// "user" | "assistant" | "narration" | "summary"
    pub role: String,
    pub content: String,
    pub version_group: i64,
    // DB 里是 INTEGER，跨层契约统一用 bool，映射在 db.rs 的查询里完成。
    pub is_active: bool,
    pub deprecated: bool,
    pub summarized: bool,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct GroupSession {
    pub id: i64,
    pub title: String,
    pub scenario: String,
    pub user_persona_id: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct GroupMember {
    pub character_id: i64,
    pub sort_order: i64,
    // 展示用冗余字段，DB 里不存在。
    pub name: String,
    pub avatar_color: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct GroupMessage {
    pub id: i64,
    pub group_id: i64,
    pub character_id: Option<i64>,
    pub role: String,
    pub content: String,
    pub version_group: i64,
    pub is_active: bool,
    pub deprecated: bool,
    pub summarized: bool,
    pub created_at: String,
}

// DESIGN 5.6 只给出函数签名里的输入类型，字段按对应表「除 id / 时间戳外的列」补全。
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct CharacterInput {
    pub name: String,
    pub tagline: String,
    pub persona: String,
    pub avatar_color: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct UserPersonaInput {
    pub name: String,
    pub persona: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct SessionInput {
    pub character_id: i64,
    pub title: String,
    pub scenario: String,
    pub user_persona_id: Option<i64>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct GroupSessionInput {
    pub title: String,
    pub scenario: String,
    pub user_persona_id: Option<i64>,
    /// 成员顺序即 sort_order，成员创建后不可增删（DESIGN 3.5.2）。
    pub character_ids: Vec<i64>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct SessionUpdate {
    pub title: String,
    pub scenario: String,
    pub user_persona_id: Option<i64>,
}

/// Channel<StreamEvent> 的载荷。tag + snake_case 事件名，字段按前端 6.1 用 camelCase。
/// 不用 rename_all = "lowercase"：它会把多词变体拼成一个词（dev.md 坑 #6）。
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "type", rename_all = "snake_case", rename_all_fields = "camelCase")]
pub enum StreamEvent {
    Start { message_id: i64 },
    Delta { content: String },
    Usage { prompt_tokens: u32, completion_tokens: u32 },
    Done { message: Message },
    /// 群聊的收尾事件：消息类型是 GroupMessage（带 character_id）。
    /// DESIGN 8.1 只定义了单人版 Done，这里按需要补一个变体。
    DoneGroup { message: GroupMessage },
    Error { message: String },
    Cancelled,
}

/// 备份里的群成员只保留 DB 真实列：GroupMember 的 name / avatar_color 是 JOIN 出来的。
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct BackupGroupMember {
    pub group_id: i64,
    pub character_id: i64,
    pub sort_order: i64,
}

/// 整体备份的 data.json（DESIGN 5.8）。各表都带 id，导入时按原 id 插回以保住外键。
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct BackupData {
    pub version: u32,
    #[serde(rename = "type")]
    pub kind: String,
    pub exported_at: String,
    pub characters: Vec<Character>,
    pub user_personas: Vec<UserPersona>,
    pub sessions: Vec<Session>,
    pub messages: Vec<Message>,
    pub group_sessions: Vec<GroupSession>,
    pub group_members: Vec<BackupGroupMember>,
    pub group_messages: Vec<GroupMessage>,
    pub settings: std::collections::HashMap<String, String>,
}

/// 连接测试结果（前端 types.ts 用 camelCase）。
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionInfo {
    pub ok: bool,
    pub model: String,
    pub ctx_length: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ContextInfo {
    pub used: u32,
    pub limit: u32,
    pub is_accurate: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_message() -> Message {
        Message {
            id: 1,
            session_id: 2,
            role: "assistant".into(),
            content: "你好".into(),
            version_group: 1,
            is_active: true,
            deprecated: false,
            summarized: false,
            created_at: "2026-11-07 00:00:00".into(),
        }
    }

    #[test]
    fn stream_event_serializes_tag_and_camel_case_fields() {
        let start = serde_json::to_value(StreamEvent::Start { message_id: 7 }).unwrap();
        assert_eq!(start["type"].as_str(), Some("start"));
        assert_eq!(start["messageId"].as_i64(), Some(7));
        assert!(start.get("message_id").is_none());

        let usage = serde_json::to_value(StreamEvent::Usage {
            prompt_tokens: 3,
            completion_tokens: 9,
        })
        .unwrap();
        assert_eq!(usage["type"].as_str(), Some("usage"));
        assert_eq!(usage["promptTokens"].as_i64(), Some(3));
        assert_eq!(usage["completionTokens"].as_i64(), Some(9));

        let cancelled = serde_json::to_value(StreamEvent::Cancelled).unwrap();
        assert_eq!(cancelled["type"].as_str(), Some("cancelled"));
    }

    #[test]
    fn context_info_uses_camel_case_contract() {
        let value = serde_json::to_value(ContextInfo {
            used: 100,
            limit: 32768,
            is_accurate: true,
        })
        .unwrap();
        assert_eq!(value["isAccurate"].as_bool(), Some(true));
        assert!(value.get("is_accurate").is_none());
    }

    #[test]
    fn model_flags_are_json_booleans_and_roundtrip() {
        let message = sample_message();
        let value = serde_json::to_value(&message).unwrap();
        assert_eq!(value["is_active"].as_bool(), Some(true));
        assert_eq!(value["deprecated"].as_bool(), Some(false));

        let restored: Message = serde_json::from_value(value).unwrap();
        assert_eq!(restored, message);
    }
}
