use crate::db;
use crate::models::{BackupData, Character, CharacterInput, GroupMessage, Message};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::io::{Cursor, Read, Write};
use std::path::Path;
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

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

// ---------- 整体备份（DESIGN 5.8 / 11.2） ----------

pub const BACKUP_TYPE: &str = "rolebox.backup";
pub const BACKUP_VERSION: u32 = 1;

const BACKUP_README: &str = "RoleBox 数据备份\n\n- data.json：全部数据（角色、分身、会话、消息、群聊、设置）\n- 恢复方式：设置 → 数据 → 导入备份（覆盖现有数据）\n";

pub async fn collect_backup(pool: &SqlitePool) -> Result<BackupData, String> {
    Ok(BackupData {
        version: BACKUP_VERSION,
        kind: BACKUP_TYPE.to_string(),
        exported_at: chrono::Local::now().to_rfc3339(),
        characters: db::list_characters(pool).await?,
        user_personas: db::list_personas(pool).await?,
        sessions: db::list_all_sessions(pool).await?,
        messages: db::list_all_messages(pool).await?,
        group_sessions: db::list_group_sessions(pool).await?,
        group_members: db::list_all_group_members(pool).await?,
        group_messages: db::list_all_group_messages(pool).await?,
        settings: db::all_settings(pool).await?,
    })
}

pub fn encode_backup(data: &BackupData) -> Result<Vec<u8>, String> {
    let json =
        serde_json::to_string_pretty(data).map_err(|e| format!("序列化备份失败：{e}"))?;
    let mut buffer = Cursor::new(Vec::new());
    {
        let mut zip = ZipWriter::new(&mut buffer);
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        zip.start_file("data.json", options)
            .map_err(|e| format!("写入 data.json 失败：{e}"))?;
        zip.write_all(json.as_bytes())
            .map_err(|e| format!("写入 data.json 失败：{e}"))?;
        zip.start_file("README.txt", options)
            .map_err(|e| format!("写入 README 失败：{e}"))?;
        zip.write_all(BACKUP_README.as_bytes())
            .map_err(|e| format!("写入 README 失败：{e}"))?;
        zip.finish().map_err(|e| format!("打包失败：{e}"))?;
    }
    Ok(buffer.into_inner())
}

pub fn decode_backup(bytes: &[u8]) -> Result<BackupData, String> {
    let mut archive =
        ZipArchive::new(Cursor::new(bytes)).map_err(|e| format!("不是有效的备份包：{e}"))?;
    let mut file = archive
        .by_name("data.json")
        .map_err(|e| format!("备份包缺少 data.json：{e}"))?;
    let mut json = String::new();
    file.read_to_string(&mut json)
        .map_err(|e| format!("读取 data.json 失败：{e}"))?;

    let data: BackupData =
        serde_json::from_str(&json).map_err(|e| format!("解析备份失败：{e}"))?;
    if data.kind != BACKUP_TYPE {
        return Err(format!("不是 RoleBox 备份：{}", data.kind));
    }
    if data.version != BACKUP_VERSION {
        return Err(format!("不支持的备份版本：{}", data.version));
    }
    Ok(data)
}

pub async fn export_backup_to_path(pool: &SqlitePool, path: &str) -> Result<(), String> {
    let data = collect_backup(pool).await?;
    let bytes = encode_backup(&data)?;
    std::fs::write(Path::new(path), bytes).map_err(|e| format!("写入备份失败：{e}"))?;
    Ok(())
}

/// 覆盖式导入。导入前先把当前数据自动导出到 `<path>.before.zip`（DESIGN 5.8），
/// 自动备份失败就取消导入，避免用户两头落空。
pub async fn import_backup_from_path(pool: &SqlitePool, path: &str) -> Result<(), String> {
    let bytes = std::fs::read(Path::new(path)).map_err(|e| format!("读取备份失败：{e}"))?;
    let data = decode_backup(&bytes)?;

    let safety_path = format!("{path}.before.zip");
    let current = collect_backup(pool).await?;
    let safety = encode_backup(&current)?;
    std::fs::write(Path::new(&safety_path), safety)
        .map_err(|e| format!("自动备份当前数据失败，已取消导入：{e}"))?;

    db::replace_all_data(pool, &data).await
}

/// 会话文本导出（DESIGN 11.3）。DESIGN 引用的「3.9.2」在本文档不存在，格式按常见约定自定。
pub fn render_session_text(
    title: &str,
    character_name: &str,
    scenario: &str,
    messages: &[(String, String)],
    format: &str,
) -> Result<String, String> {
    match format {
        "txt" => {
            let mut lines = vec![
                title.to_string(),
                format!("角色：{character_name}"),
                format!("场景：{}", if scenario.is_empty() { "（未指定）" } else { scenario }),
                String::new(),
            ];
            for (name, content) in messages {
                lines.push(format!("[{name}] {content}"));
            }
            Ok(lines.join("\n"))
        }
        "md" => {
            let mut lines = vec![
                format!("# {title}"),
                String::new(),
                format!("- 角色：{character_name}"),
                format!("- 场景：{}", if scenario.is_empty() { "（未指定）" } else { scenario }),
                String::new(),
            ];
            for (name, content) in messages {
                if name == "旁白" {
                    lines.push(format!("*【旁白】{content}*"));
                } else {
                    lines.push(format!("**{name}**：{content}"));
                }
                lines.push(String::new());
            }
            Ok(lines.join("\n").trim_end().to_string())
        }
        other => Err(format!("不支持的导出格式：{other}")),
    }
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

    /// 不能用 `:memory:`：连接池多个连接各自持有独立内存库，migrate 建的表在别的连接里看不到。
    async fn test_pool() -> SqlitePool {
        use std::sync::atomic::{AtomicUsize, Ordering};
        static COUNTER: AtomicUsize = AtomicUsize::new(0);
        let index = COUNTER.fetch_add(1, Ordering::SeqCst);
        let path = std::env::temp_dir().join(format!(
            "rolebox-export-{}-{index}.db",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&path);
        let pool = crate::db::connect(&path).await.unwrap();
        crate::db::migrate(&pool).await.unwrap();
        pool
    }

    #[tokio::test]
    async fn backup_roundtrip_restores_every_table() {
        let pool = test_pool().await;
        let character = crate::db::create_character(&pool, &sample_input())
            .await
            .unwrap();
        let session = crate::db::create_session(
            &pool,
            &crate::models::SessionInput {
                character_id: character.id,
                title: "初遇".into(),
                scenario: "雨天".into(),
                user_persona_id: None,
            },
        )
        .await
        .unwrap();
        crate::db::insert_message(&pool, session.id, "user", "你好")
            .await
            .unwrap();
        crate::db::set_setting(&pool, "server_url", "http://x")
            .await
            .unwrap();

        let before = collect_backup(&pool).await.unwrap();
        let bytes = encode_backup(&before).unwrap();
        let restored = decode_backup(&bytes).unwrap();
        crate::db::replace_all_data(&pool, &restored)
            .await
            .unwrap();
        let after = collect_backup(&pool).await.unwrap();

        assert_eq!(after.characters, before.characters);
        assert_eq!(after.sessions, before.sessions);
        assert_eq!(after.messages, before.messages);
        assert_eq!(
            after.settings.get("server_url"),
            Some(&"http://x".to_string())
        );
    }

    #[tokio::test]
    async fn backup_zip_contains_data_json_and_readme() {
        let pool = test_pool().await;
        let data = collect_backup(&pool).await.unwrap();
        let bytes = encode_backup(&data).unwrap();

        let mut archive = ZipArchive::new(Cursor::new(bytes)).unwrap();
        assert!(archive.by_name("data.json").is_ok());
        assert!(archive.by_name("README.txt").is_ok());
    }

    #[tokio::test]
    async fn decode_rejects_wrong_type() {
        let pool = test_pool().await;
        let mut data = collect_backup(&pool).await.unwrap();
        data.kind = "rolebox.other".into();
        let bytes = encode_backup(&data).unwrap();

        assert!(decode_backup(&bytes).is_err());
    }
}
