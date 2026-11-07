use crate::db;
use crate::models::{Character, CharacterInput};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::path::Path;

// DESIGN 11.1 引用「DESIGN 3.1.4」但正文未给出字段，这里按 5.8 备份文件的
// version / type / exported_at 模式自定，并在 DEV.md 登记。
pub const CHARACTER_EXPORT_TYPE: &str = "rolebox.character";
pub const CHARACTER_EXPORT_VERSION: u32 = 1;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct CharacterPayload {
    pub name: String,
    pub tagline: String,
    pub persona: String,
    pub avatar_color: String,
}

impl From<&CharacterInput> for CharacterPayload {
    fn from(input: &CharacterInput) -> Self {
        Self {
            name: input.name.clone(),
            tagline: input.tagline.clone(),
            persona: input.persona.clone(),
            avatar_color: input.avatar_color.clone(),
        }
    }
}

impl From<CharacterPayload> for CharacterInput {
    fn from(payload: CharacterPayload) -> Self {
        Self {
            name: payload.name,
            tagline: payload.tagline,
            persona: payload.persona,
            avatar_color: payload.avatar_color,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct CharacterFile {
    pub version: u32,
    // Rust 的 `type` 是关键字，字段名用 kind 再显式重命名。
    #[serde(rename = "type")]
    pub kind: String,
    pub exported_at: String,
    pub character: CharacterPayload,
}

/// 编解码抽成纯函数，便于不碰文件系统就能验证格式与一致性。
pub fn encode_character(input: &CharacterInput, exported_at: &str) -> Result<String, String> {
    let file = CharacterFile {
        version: CHARACTER_EXPORT_VERSION,
        kind: CHARACTER_EXPORT_TYPE.to_string(),
        exported_at: exported_at.to_string(),
        character: CharacterPayload::from(input),
    };
    serde_json::to_string_pretty(&file).map_err(|e| format!("序列化角色失败：{e}"))
}

pub fn decode_character(json: &str) -> Result<CharacterInput, String> {
    let file: CharacterFile =
        serde_json::from_str(json).map_err(|e| format!("JSON 解析失败：{e}"))?;
    if file.kind != CHARACTER_EXPORT_TYPE {
        return Err(format!("不是角色文件：{}", file.kind));
    }
    if file.version != CHARACTER_EXPORT_VERSION {
        return Err(format!("不支持的角色文件版本：{}", file.version));
    }
    Ok(file.character.into())
}

pub async fn export_character(
    pool: &SqlitePool,
    id: i64,
    path: &str,
) -> Result<(), String> {
    let character = db::get_character(pool, id).await?;
    let input = CharacterInput {
        name: character.name,
        tagline: character.tagline,
        persona: character.persona,
        avatar_color: character.avatar_color,
    };
    let json = encode_character(&input, &chrono::Local::now().to_rfc3339())?;
    std::fs::write(Path::new(path), json).map_err(|e| format!("写入文件失败：{e}"))?;
    Ok(())
}

pub async fn import_character(
    pool: &SqlitePool,
    path: &str,
    mode: &str,
) -> Result<Character, String> {
    // Phase 1 只支持新建；覆盖 / 合并模式明确不做（整体备份的覆盖模式留到 C44）。
    if mode != "new" {
        return Err("Phase 1 只支持 new 模式".to_string());
    }
    let json = std::fs::read_to_string(Path::new(path))
        .map_err(|e| format!("读取文件失败：{e}"))?;
    let input = decode_character(&json)?;
    db::create_character(pool, &input).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_input() -> CharacterInput {
        CharacterInput {
            name: "甲".into(),
            tagline: "一句话".into(),
            persona: "完整设定".into(),
            avatar_color: "#abcdef".into(),
        }
    }

    #[test]
    fn encode_includes_version_type_and_all_fields() {
        let json = encode_character(&sample_input(), "2026-11-07T08:00:00+08:00").unwrap();
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();

        assert_eq!(value["version"].as_u64(), Some(1));
        assert_eq!(value["type"].as_str(), Some("rolebox.character"));
        assert_eq!(value["character"]["name"].as_str(), Some("甲"));
        assert_eq!(value["character"]["tagline"].as_str(), Some("一句话"));
        assert_eq!(value["character"]["persona"].as_str(), Some("完整设定"));
        assert_eq!(
            value["character"]["avatar_color"].as_str(),
            Some("#abcdef")
        );
    }

    #[test]
    fn decode_rejects_wrong_type_or_version() {
        let original = encode_character(&sample_input(), "t").unwrap();

        let mut wrong_type: serde_json::Value = serde_json::from_str(&original).unwrap();
        wrong_type["type"] = serde_json::json!("rolebox.backup");
        assert!(decode_character(&wrong_type.to_string()).is_err());

        let mut wrong_version: serde_json::Value = serde_json::from_str(&original).unwrap();
        wrong_version["version"] = serde_json::json!(99);
        assert!(decode_character(&wrong_version.to_string()).is_err());
    }

    #[test]
    fn roundtrip_preserves_all_fields() {
        let json = encode_character(&sample_input(), "t").unwrap();
        assert_eq!(decode_character(&json).unwrap(), sample_input());
    }
}
