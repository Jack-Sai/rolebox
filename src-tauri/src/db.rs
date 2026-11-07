use crate::models::{
    Character, CharacterInput, Message, Session, SessionInput, UserPersona, UserPersonaInput,
};
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteRow};
use sqlx::{Row, SqlitePool};
use std::path::Path;

/// 8 张表 + 5 个索引。全部 IF NOT EXISTS：覆盖安装不动 app_data_dir 下的数据库，
/// 启动每次都会跑到这里，幂等是硬性要求（dev.md 坑 #7 / #32）。
/// 列定义逐字对应 DESIGN.md 4.1，不要在此注入动态内容。
const SCHEMA_STATEMENTS: &[&str] = &[
    "CREATE TABLE IF NOT EXISTS characters (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        name            TEXT    NOT NULL,
        tagline         TEXT    NOT NULL,
        persona         TEXT    NOT NULL,
        avatar_color    TEXT    NOT NULL,
        created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    )",
    "CREATE TABLE IF NOT EXISTS user_personas (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT    NOT NULL,
        persona     TEXT    NOT NULL,
        created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    )",
    "CREATE TABLE IF NOT EXISTS sessions (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        character_id    INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
        title           TEXT    NOT NULL,
        scenario        TEXT    NOT NULL DEFAULT '',
        user_persona_id INTEGER          REFERENCES user_personas(id) ON DELETE SET NULL,
        created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    )",
    "CREATE INDEX IF NOT EXISTS idx_sessions_character ON sessions(character_id)",
    "CREATE TABLE IF NOT EXISTS messages (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id      INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        role            TEXT    NOT NULL CHECK (role IN ('user','assistant','narration','summary')),
        content         TEXT    NOT NULL,
        version_group   INTEGER NOT NULL DEFAULT 0,
        is_active       INTEGER NOT NULL DEFAULT 1,
        deprecated      INTEGER NOT NULL DEFAULT 0,
        summarized      INTEGER NOT NULL DEFAULT 0,
        created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    )",
    "CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, id)",
    "CREATE INDEX IF NOT EXISTS idx_messages_group   ON messages(version_group, is_active)",
    "CREATE TABLE IF NOT EXISTS group_sessions (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        title           TEXT    NOT NULL,
        scenario        TEXT    NOT NULL DEFAULT '',
        user_persona_id INTEGER          REFERENCES user_personas(id) ON DELETE SET NULL,
        created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    )",
    "CREATE TABLE IF NOT EXISTS group_members (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id        INTEGER NOT NULL REFERENCES group_sessions(id) ON DELETE CASCADE,
        character_id    INTEGER NOT NULL REFERENCES characters(id)     ON DELETE CASCADE,
        sort_order      INTEGER NOT NULL DEFAULT 0,
        UNIQUE(group_id, character_id)
    )",
    "CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id, sort_order)",
    "CREATE TABLE IF NOT EXISTS group_messages (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id        INTEGER NOT NULL REFERENCES group_sessions(id) ON DELETE CASCADE,
        character_id    INTEGER          REFERENCES characters(id)     ON DELETE SET NULL,
        role            TEXT    NOT NULL CHECK (role IN ('user','assistant','narration','summary')),
        content         TEXT    NOT NULL,
        version_group   INTEGER NOT NULL DEFAULT 0,
        is_active       INTEGER NOT NULL DEFAULT 1,
        deprecated      INTEGER NOT NULL DEFAULT 0,
        summarized      INTEGER NOT NULL DEFAULT 0,
        created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    )",
    "CREATE INDEX IF NOT EXISTS idx_group_messages_group ON group_messages(group_id, id)",
    "CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )",
];

/// 建立连接池（WAL、外键、max 5）并跑一次幂等建表。
pub async fn connect(path: &Path) -> Result<SqlitePool, String> {
    let options = SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .foreign_keys(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await
        .map_err(|e| format!("连接数据库失败：{e}"))?;

    migrate(&pool).await?;
    Ok(pool)
}

/// DESIGN 5.1 的 setup 建表步骤。Phase 1 只有第一版 schema，不做版本链，
/// 因此这里只有建表；后续版本加列时用 ensure_column 逐列补齐。
pub async fn migrate(pool: &SqlitePool) -> Result<(), String> {
    for stmt in SCHEMA_STATEMENTS {
        sqlx::query(stmt)
            .execute(pool)
            .await
            .map_err(|e| format!("建表失败：{e}"))?;
    }
    Ok(())
}

pub(crate) async fn column_exists(
    pool: &SqlitePool,
    table: &str,
    column: &str,
) -> Result<bool, String> {
    // SQLite 的 ADD COLUMN 没有 IF NOT EXISTS；必须用 pragma_table_info 先判断（坑 #7）。
    let count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM pragma_table_info(?) WHERE name = ?")
            .bind(table)
            .bind(column)
            .fetch_one(pool)
            .await
            .map_err(|e| format!("读取表结构失败：{e}"))?;
    Ok(count > 0)
}

/// 表名/列名/类型均来自代码常量而非用户输入，此处拼接不会引入注入。
pub(crate) async fn ensure_column(
    pool: &SqlitePool,
    table: &str,
    column: &str,
    decl: &str,
) -> Result<(), String> {
    if column_exists(pool, table, column).await? {
        return Ok(());
    }
    let alter = format!("ALTER TABLE {table} ADD COLUMN {column} {decl}");
    sqlx::query(&alter)
        .execute(pool)
        .await
        .map_err(|e| format!("补列失败：{e}"))?;
    Ok(())
}

// 不用 sqlx::FromRow derive：Cargo.toml 未启用 macros feature（干净环境无
// DATABASE_URL 时 query! 会编译失败）。手动映射也便于统一把 INTEGER 转成 bool。
fn character_from_row(row: &SqliteRow) -> Result<Character, String> {
    Ok(Character {
        id: row.try_get("id").map_err(|e| e.to_string())?,
        name: row.try_get("name").map_err(|e| e.to_string())?,
        tagline: row.try_get("tagline").map_err(|e| e.to_string())?,
        persona: row.try_get("persona").map_err(|e| e.to_string())?,
        avatar_color: row.try_get("avatar_color").map_err(|e| e.to_string())?,
        created_at: row.try_get("created_at").map_err(|e| e.to_string())?,
    })
}

fn persona_from_row(row: &SqliteRow) -> Result<UserPersona, String> {
    Ok(UserPersona {
        id: row.try_get("id").map_err(|e| e.to_string())?,
        name: row.try_get("name").map_err(|e| e.to_string())?,
        persona: row.try_get("persona").map_err(|e| e.to_string())?,
    })
}

pub async fn list_characters(pool: &SqlitePool) -> Result<Vec<Character>, String> {
    let rows = sqlx::query(
        "SELECT id, name, tagline, persona, avatar_color, created_at FROM characters ORDER BY id",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("查询角色失败：{e}"))?;
    rows.iter().map(character_from_row).collect()
}

pub async fn get_character(pool: &SqlitePool, id: i64) -> Result<Character, String> {
    let row = sqlx::query(
        "SELECT id, name, tagline, persona, avatar_color, created_at FROM characters WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("查询角色失败：{e}"))?
    .ok_or_else(|| format!("角色 {id} 不存在"))?;
    character_from_row(&row)
}

pub async fn create_character(
    pool: &SqlitePool,
    input: &CharacterInput,
) -> Result<Character, String> {
    let result = sqlx::query(
        "INSERT INTO characters (name, tagline, persona, avatar_color) VALUES (?, ?, ?, ?)",
    )
    .bind(&input.name)
    .bind(&input.tagline)
    .bind(&input.persona)
    .bind(&input.avatar_color)
    .execute(pool)
    .await
    .map_err(|e| format!("新增角色失败：{e}"))?;
    get_character(pool, result.last_insert_rowid()).await
}

pub async fn update_character(
    pool: &SqlitePool,
    id: i64,
    input: &CharacterInput,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE characters SET name = ?, tagline = ?, persona = ?, avatar_color = ? WHERE id = ?",
    )
    .bind(&input.name)
    .bind(&input.tagline)
    .bind(&input.persona)
    .bind(&input.avatar_color)
    .bind(id)
    .execute(pool)
    .await
    .map_err(|e| format!("更新角色失败：{e}"))?;
    Ok(())
}

pub async fn delete_character(pool: &SqlitePool, id: i64) -> Result<(), String> {
    sqlx::query("DELETE FROM characters WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| format!("删除角色失败：{e}"))?;
    Ok(())
}

pub async fn list_personas(pool: &SqlitePool) -> Result<Vec<UserPersona>, String> {
    let rows = sqlx::query("SELECT id, name, persona FROM user_personas ORDER BY id")
        .fetch_all(pool)
        .await
        .map_err(|e| format!("查询分身失败：{e}"))?;
    rows.iter().map(persona_from_row).collect()
}

pub async fn create_persona(
    pool: &SqlitePool,
    input: &UserPersonaInput,
) -> Result<UserPersona, String> {
    let result = sqlx::query("INSERT INTO user_personas (name, persona) VALUES (?, ?)")
        .bind(&input.name)
        .bind(&input.persona)
        .execute(pool)
        .await
        .map_err(|e| format!("新增分身失败：{e}"))?;
    let row = sqlx::query("SELECT id, name, persona FROM user_personas WHERE id = ?")
        .bind(result.last_insert_rowid())
        .fetch_one(pool)
        .await
        .map_err(|e| format!("查询分身失败：{e}"))?;
    persona_from_row(&row)
}

pub async fn update_persona(
    pool: &SqlitePool,
    id: i64,
    input: &UserPersonaInput,
) -> Result<(), String> {
    sqlx::query("UPDATE user_personas SET name = ?, persona = ? WHERE id = ?")
        .bind(&input.name)
        .bind(&input.persona)
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| format!("更新分身失败：{e}"))?;
    Ok(())
}

pub async fn delete_persona(pool: &SqlitePool, id: i64) -> Result<(), String> {
    sqlx::query("DELETE FROM user_personas WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| format!("删除分身失败：{e}"))?;
    Ok(())
}

fn session_from_row(row: &SqliteRow) -> Result<Session, String> {
    Ok(Session {
        id: row.try_get("id").map_err(|e| e.to_string())?,
        character_id: row.try_get("character_id").map_err(|e| e.to_string())?,
        title: row.try_get("title").map_err(|e| e.to_string())?,
        scenario: row.try_get("scenario").map_err(|e| e.to_string())?,
        user_persona_id: row.try_get("user_persona_id").map_err(|e| e.to_string())?,
        created_at: row.try_get("created_at").map_err(|e| e.to_string())?,
        updated_at: row.try_get("updated_at").map_err(|e| e.to_string())?,
    })
}

/// DB 的布尔列是 INTEGER，跨层契约是 bool，在这里显式转换。
fn message_from_row(row: &SqliteRow) -> Result<Message, String> {
    let is_active: i64 = row.try_get("is_active").map_err(|e| e.to_string())?;
    let deprecated: i64 = row.try_get("deprecated").map_err(|e| e.to_string())?;
    let summarized: i64 = row.try_get("summarized").map_err(|e| e.to_string())?;
    Ok(Message {
        id: row.try_get("id").map_err(|e| e.to_string())?,
        session_id: row.try_get("session_id").map_err(|e| e.to_string())?,
        role: row.try_get("role").map_err(|e| e.to_string())?,
        content: row.try_get("content").map_err(|e| e.to_string())?,
        version_group: row.try_get("version_group").map_err(|e| e.to_string())?,
        is_active: is_active != 0,
        deprecated: deprecated != 0,
        summarized: summarized != 0,
        created_at: row.try_get("created_at").map_err(|e| e.to_string())?,
    })
}

const SESSION_COLUMNS: &str =
    "id, character_id, title, scenario, user_persona_id, created_at, updated_at";
const MESSAGE_COLUMNS: &str = "id, session_id, role, content, version_group, is_active, deprecated, summarized, created_at";

pub async fn list_sessions(
    pool: &SqlitePool,
    character_id: i64,
) -> Result<Vec<Session>, String> {
    let rows = sqlx::query(&format!(
        "SELECT {SESSION_COLUMNS} FROM sessions WHERE character_id = ? ORDER BY id"
    ))
    .bind(character_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("查询会话失败：{e}"))?;
    rows.iter().map(session_from_row).collect()
}

pub async fn get_session(pool: &SqlitePool, id: i64) -> Result<Session, String> {
    let row = sqlx::query(&format!(
        "SELECT {SESSION_COLUMNS} FROM sessions WHERE id = ?"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("查询会话失败：{e}"))?
    .ok_or_else(|| format!("会话 {id} 不存在"))?;
    session_from_row(&row)
}

pub async fn create_session(
    pool: &SqlitePool,
    input: &SessionInput,
) -> Result<Session, String> {
    let result = sqlx::query(
        "INSERT INTO sessions (character_id, title, scenario, user_persona_id) VALUES (?, ?, ?, ?)",
    )
    .bind(input.character_id)
    .bind(&input.title)
    .bind(&input.scenario)
    .bind(input.user_persona_id)
    .execute(pool)
    .await
    .map_err(|e| format!("新增会话失败：{e}"))?;
    get_session(pool, result.last_insert_rowid()).await
}

pub async fn delete_session(pool: &SqlitePool, id: i64) -> Result<(), String> {
    sqlx::query("DELETE FROM sessions WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| format!("删除会话失败：{e}"))?;
    Ok(())
}

pub async fn get_persona(pool: &SqlitePool, id: i64) -> Result<UserPersona, String> {
    let row = sqlx::query("SELECT id, name, persona FROM user_personas WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("查询分身失败：{e}"))?
        .ok_or_else(|| format!("分身 {id} 不存在"))?;
    persona_from_row(&row)
}

/// 只取激活版本；被摘要的消息由 format_single_history 过滤，不在这里丢掉。
pub async fn list_messages(
    pool: &SqlitePool,
    session_id: i64,
) -> Result<Vec<Message>, String> {
    let rows = sqlx::query(&format!(
        // 按 version_group 排序：重生成的新版本 id 更大，但 group 沿用旧值，
        // 这样才能留在原位置；若按 id 排会把它甩到会话末尾，上下文顺序就错了。
        // 按 version_group 排序：重生成的新版本 id 更大，但 group 沿用旧值，
        // 这样才能留在原位置；若按 id 排会把它甩到会话末尾，上下文顺序就错了。
        "SELECT {MESSAGE_COLUMNS} FROM messages WHERE session_id = ? AND is_active = 1 ORDER BY version_group, id"
    ))
    .bind(session_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("查询消息失败：{e}"))?;
    rows.iter().map(message_from_row).collect()
}

pub async fn get_message(pool: &SqlitePool, id: i64) -> Result<Message, String> {
    let row = sqlx::query(&format!("SELECT {MESSAGE_COLUMNS} FROM messages WHERE id = ?"))
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("查询消息失败：{e}"))?
        .ok_or_else(|| format!("消息 {id} 不存在"))?;
    message_from_row(&row)
}

/// 新建消息后把 version_group 回填成自己的 id（DESIGN 4.2）。
pub async fn insert_message(
    pool: &SqlitePool,
    session_id: i64,
    role: &str,
    content: &str,
) -> Result<i64, String> {
    let result = sqlx::query("INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)")
        .bind(session_id)
        .bind(role)
        .bind(content)
        .execute(pool)
        .await
        .map_err(|e| format!("新增消息失败：{e}"))?;
    let id = result.last_insert_rowid();
    sqlx::query("UPDATE messages SET version_group = id WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| format!("回填版本组失败：{e}"))?;
    Ok(id)
}

pub async fn update_message(pool: &SqlitePool, id: i64, content: &str) -> Result<(), String> {
    sqlx::query("UPDATE messages SET content = ? WHERE id = ?")
        .bind(content)
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| format!("更新消息失败：{e}"))?;
    Ok(())
}

pub async fn delete_message(pool: &SqlitePool, id: i64) -> Result<(), String> {
    sqlx::query("DELETE FROM messages WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| format!("删除消息失败：{e}"))?;
    Ok(())
}

/// 编辑或删除某条消息后，它之后的同会话消息都标记「上下文已变」。
/// 只影响 UI 提示，**不过滤上下文**（DESIGN 4.2）：消息仍然进入下一次请求。
pub async fn mark_deprecated_after(
    pool: &SqlitePool,
    session_id: i64,
    after_id: i64,
) -> Result<(), String> {
    sqlx::query("UPDATE messages SET deprecated = 1 WHERE session_id = ? AND id > ?")
        .bind(session_id)
        .bind(after_id)
        .execute(pool)
        .await
        .map_err(|e| format!("标记过期失败：{e}"))?;
    Ok(())
}

/// 同一 version_group 的全部版本，按 id 升序（旧的在前）。
pub async fn list_versions(
    pool: &SqlitePool,
    version_group: i64,
) -> Result<Vec<Message>, String> {
    let rows = sqlx::query(&format!(
        "SELECT {MESSAGE_COLUMNS} FROM messages WHERE version_group = ? ORDER BY id"
    ))
    .bind(version_group)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("查询版本失败：{e}"))?;
    rows.iter().map(message_from_row).collect()
}

/// 切换激活版本：同一 group 内先全置 0 再置目标为 1。
/// 必须事务化，否则中途失败会留下「一条都没有 is_active」的组。
pub async fn activate_version(pool: &SqlitePool, message_id: i64) -> Result<(), String> {
    let message = get_message(pool, message_id).await?;
    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("开启事务失败：{e}"))?;
    sqlx::query("UPDATE messages SET is_active = 0 WHERE version_group = ?")
        .bind(message.version_group)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("清空激活版本失败：{e}"))?;
    sqlx::query("UPDATE messages SET is_active = 1 WHERE id = ?")
        .bind(message_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("激活版本失败：{e}"))?;
    tx.commit()
        .await
        .map_err(|e| format!("提交事务失败：{e}"))?;
    Ok(())
}

/// 重新生成前先把整组下线；新版本落库时直接 is_active = 1。
pub async fn deactivate_group(pool: &SqlitePool, version_group: i64) -> Result<(), String> {
    sqlx::query("UPDATE messages SET is_active = 0 WHERE version_group = ?")
        .bind(version_group)
        .execute(pool)
        .await
        .map_err(|e| format!("下线版本组失败：{e}"))?;
    Ok(())
}

/// 插入一个新版本；version_group 沿用旧版本，不走 insert_message 的自增回填。
pub async fn insert_message_version(
    pool: &SqlitePool,
    session_id: i64,
    role: &str,
    content: &str,
    version_group: i64,
) -> Result<i64, String> {
    let result = sqlx::query(
        "INSERT INTO messages (session_id, role, content, version_group, is_active) VALUES (?, ?, ?, ?, 1)",
    )
    .bind(session_id)
    .bind(role)
    .bind(content)
    .bind(version_group)
    .execute(pool)
    .await
    .map_err(|e| format!("新增消息版本失败：{e}"))?;
    Ok(result.last_insert_rowid())
}

pub async fn get_setting(pool: &SqlitePool, key: &str) -> Result<Option<String>, String> {
    sqlx::query_scalar("SELECT value FROM settings WHERE key = ?")
        .bind(key)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("读取设置失败：{e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 内存库必须单连接池：多连接池下每个连接各自建库，migrate 的结果互相不可见。
    async fn test_pool() -> SqlitePool {
        SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn migrate_creates_all_tables() {
        let pool = test_pool().await;
        migrate(&pool).await.unwrap();

        let names: Vec<String> = sqlx::query_scalar(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
        )
        .fetch_all(&pool)
        .await
        .unwrap();

        for expected in [
            "characters",
            "user_personas",
            "sessions",
            "messages",
            "group_sessions",
            "group_members",
            "group_messages",
            "settings",
        ] {
            assert!(
                names.iter().any(|n| n == expected),
                "建表结果缺少 {expected}"
            );
        }
    }

    #[tokio::test]
    async fn migrate_is_idempotent() {
        let pool = test_pool().await;
        migrate(&pool).await.unwrap();
        migrate(&pool).await.unwrap();
    }

    #[tokio::test]
    async fn ensure_column_is_idempotent() {
        let pool = test_pool().await;
        migrate(&pool).await.unwrap();

        ensure_column(&pool, "characters", "probe", "TEXT")
            .await
            .unwrap();
        ensure_column(&pool, "characters", "probe", "TEXT")
            .await
            .unwrap();

        assert!(column_exists(&pool, "characters", "probe").await.unwrap());
    }

    fn character_input(name: &str) -> CharacterInput {
        CharacterInput {
            name: name.into(),
            tagline: "一句话简介".into(),
            persona: "完整设定".into(),
            avatar_color: "#abcdef".into(),
        }
    }

    fn persona_input(name: &str) -> UserPersonaInput {
        UserPersonaInput {
            name: name.into(),
            persona: "用户身份".into(),
        }
    }

    /// 外键级联只在 PRAGMA 打开时生效，测试库显式开启以贴近 connect() 的配置。
    async fn seeded_pool() -> SqlitePool {
        let pool = test_pool().await;
        migrate(&pool).await.unwrap();
        sqlx::query("PRAGMA foreign_keys = ON")
            .execute(&pool)
            .await
            .unwrap();
        pool
    }

    #[tokio::test]
    async fn list_characters_returns_inserted_rows_in_id_order() {
        let pool = seeded_pool().await;
        create_character(&pool, &character_input("甲")).await.unwrap();
        create_character(&pool, &character_input("乙")).await.unwrap();

        let list = list_characters(&pool).await.unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].name, "甲");
        assert_eq!(list[1].name, "乙");
    }

    #[tokio::test]
    async fn get_character_returns_only_the_requested_row() {
        let pool = seeded_pool().await;
        let first = create_character(&pool, &character_input("甲")).await.unwrap();
        let second = create_character(&pool, &character_input("乙")).await.unwrap();

        assert_eq!(get_character(&pool, second.id).await.unwrap().name, "乙");
        assert_eq!(get_character(&pool, first.id).await.unwrap().name, "甲");
        assert!(get_character(&pool, 99999).await.is_err());
    }

    #[tokio::test]
    async fn create_character_persists_all_fields() {
        let pool = seeded_pool().await;
        let created = create_character(&pool, &character_input("甲")).await.unwrap();

        assert_eq!(created.name, "甲");
        assert_eq!(created.tagline, "一句话简介");
        assert_eq!(created.persona, "完整设定");
        assert_eq!(created.avatar_color, "#abcdef");
        assert!(created.id > 0);
        assert!(!created.created_at.is_empty());
    }

    #[tokio::test]
    async fn update_character_replaces_fields() {
        let pool = seeded_pool().await;
        let created = create_character(&pool, &character_input("甲")).await.unwrap();

        let changed = CharacterInput {
            name: "新名字".into(),
            tagline: "新简介".into(),
            persona: "新设定".into(),
            avatar_color: "#123456".into(),
        };
        update_character(&pool, created.id, &changed).await.unwrap();

        let saved = get_character(&pool, created.id).await.unwrap();
        assert_eq!(saved.name, "新名字");
        assert_eq!(saved.tagline, "新简介");
        assert_eq!(saved.persona, "新设定");
        assert_eq!(saved.avatar_color, "#123456");
    }

    #[tokio::test]
    async fn delete_character_removes_only_that_row() {
        let pool = seeded_pool().await;
        let first = create_character(&pool, &character_input("甲")).await.unwrap();
        create_character(&pool, &character_input("乙")).await.unwrap();

        delete_character(&pool, first.id).await.unwrap();
        let list = list_characters(&pool).await.unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "乙");
    }

    #[tokio::test]
    async fn list_personas_returns_inserted_rows_in_id_order() {
        let pool = seeded_pool().await;
        create_persona(&pool, &persona_input("甲")).await.unwrap();
        create_persona(&pool, &persona_input("乙")).await.unwrap();

        let list = list_personas(&pool).await.unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].name, "甲");
        assert_eq!(list[1].name, "乙");
    }

    #[tokio::test]
    async fn create_persona_persists_fields() {
        let pool = seeded_pool().await;
        let created = create_persona(&pool, &persona_input("甲")).await.unwrap();

        assert_eq!(created.name, "甲");
        assert_eq!(created.persona, "用户身份");
        assert!(created.id > 0);
    }

    #[tokio::test]
    async fn update_persona_replaces_fields() {
        let pool = seeded_pool().await;
        let created = create_persona(&pool, &persona_input("甲")).await.unwrap();

        update_persona(
            &pool,
            created.id,
            &UserPersonaInput {
                name: "新分身".into(),
                persona: "新身份".into(),
            },
        )
        .await
        .unwrap();

        let list = list_personas(&pool).await.unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "新分身");
        assert_eq!(list[0].persona, "新身份");
    }

    #[tokio::test]
    async fn delete_persona_removes_only_that_row() {
        let pool = seeded_pool().await;
        let first = create_persona(&pool, &persona_input("甲")).await.unwrap();
        create_persona(&pool, &persona_input("乙")).await.unwrap();

        delete_persona(&pool, first.id).await.unwrap();
        let list = list_personas(&pool).await.unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "乙");
    }

    #[tokio::test]
    async fn deleting_character_cascades_to_sessions() {
        let pool = seeded_pool().await;
        let character = create_character(&pool, &character_input("甲")).await.unwrap();
        sqlx::query("INSERT INTO sessions (character_id, title) VALUES (?, ?)")
            .bind(character.id)
            .bind("会话")
            .execute(&pool)
            .await
            .unwrap();

        delete_character(&pool, character.id).await.unwrap();

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sessions")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 0, "删除角色应级联删除其会话");
    }

    fn session_input(character_id: i64, title: &str) -> SessionInput {
        SessionInput {
            character_id,
            title: title.into(),
            scenario: "雨天".into(),
            user_persona_id: None,
        }
    }

    #[tokio::test]
    async fn create_and_get_session_persists_all_fields() {
        let pool = seeded_pool().await;
        let character = create_character(&pool, &character_input("甲"))
            .await
            .unwrap();

        let created = create_session(&pool, &session_input(character.id, "初遇"))
            .await
            .unwrap();
        assert!(created.id > 0);
        assert_eq!(created.title, "初遇");
        assert_eq!(created.character_id, character.id);
        assert_eq!(created.scenario, "雨天");
        assert_eq!(created.user_persona_id, None);

        assert_eq!(get_session(&pool, created.id).await.unwrap(), created);
    }

    #[tokio::test]
    async fn list_sessions_is_scoped_to_character() {
        let pool = seeded_pool().await;
        let first = create_character(&pool, &character_input("甲"))
            .await
            .unwrap();
        let second = create_character(&pool, &character_input("乙"))
            .await
            .unwrap();
        create_session(&pool, &session_input(first.id, "甲会话"))
            .await
            .unwrap();
        create_session(&pool, &session_input(second.id, "乙会话"))
            .await
            .unwrap();

        let list = list_sessions(&pool, first.id).await.unwrap();
        assert_eq!(list.len(), 1);
        assert!(list[0].id > 0);
        assert_eq!(list[0].title, "甲会话");
    }

    #[tokio::test]
    async fn deleting_session_cascades_to_messages() {
        let pool = seeded_pool().await;
        let character = create_character(&pool, &character_input("甲"))
            .await
            .unwrap();
        let session = create_session(&pool, &session_input(character.id, "初遇"))
            .await
            .unwrap();
        insert_message(&pool, session.id, "user", "你好")
            .await
            .unwrap();

        delete_session(&pool, session.id).await.unwrap();

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM messages")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 0, "删除会话应级联删除其消息");
    }

    #[tokio::test]
    async fn insert_message_backfills_version_group_and_defaults() {
        let pool = seeded_pool().await;
        let character = create_character(&pool, &character_input("甲"))
            .await
            .unwrap();
        let session = create_session(&pool, &session_input(character.id, "初遇"))
            .await
            .unwrap();

        let id = insert_message(&pool, session.id, "user", "你好")
            .await
            .unwrap();
        let message = get_message(&pool, id).await.unwrap();

        assert_eq!(message.version_group, id);
        assert_eq!(message.content, "你好");
        assert_eq!(message.role, "user");
        assert!(message.is_active);
        assert!(!message.deprecated);
        assert!(!message.summarized);
    }

    #[tokio::test]
    async fn list_messages_returns_only_active_versions() {
        let pool = seeded_pool().await;
        let character = create_character(&pool, &character_input("甲"))
            .await
            .unwrap();
        let session = create_session(&pool, &session_input(character.id, "初遇"))
            .await
            .unwrap();
        let active = insert_message(&pool, session.id, "user", "第一版")
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO messages (session_id, role, content, version_group, is_active) VALUES (?, ?, ?, ?, 0)",
        )
        .bind(session.id)
        .bind("user")
        .bind("旧版本")
        .bind(active)
        .execute(&pool)
        .await
        .unwrap();

        let list = list_messages(&pool, session.id).await.unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].content, "第一版");
    }

    #[tokio::test]
    async fn get_message_returns_the_requested_row() {
        let pool = seeded_pool().await;
        let character = create_character(&pool, &character_input("甲"))
            .await
            .unwrap();
        let session = create_session(&pool, &session_input(character.id, "初遇"))
            .await
            .unwrap();
        let first = insert_message(&pool, session.id, "user", "甲")
            .await
            .unwrap();
        let second = insert_message(&pool, session.id, "assistant", "乙")
            .await
            .unwrap();

        assert_eq!(get_message(&pool, second).await.unwrap().content, "乙");
        assert_eq!(get_message(&pool, first).await.unwrap().content, "甲");
        assert!(get_message(&pool, 99999).await.is_err());
    }

    async fn session_with_character(pool: &SqlitePool, name: &str) -> i64 {
        let character = create_character(pool, &character_input(name)).await.unwrap();
        create_session(pool, &session_input(character.id, "会话"))
            .await
            .unwrap()
            .id
    }

    #[tokio::test]
    async fn update_message_changes_content_only() {
        let pool = seeded_pool().await;
        let session_id = session_with_character(&pool, "甲").await;
        let id = insert_message(&pool, session_id, "assistant", "旧内容")
            .await
            .unwrap();

        update_message(&pool, id, "新内容").await.unwrap();

        let message = get_message(&pool, id).await.unwrap();
        assert_eq!(message.content, "新内容");
        assert_eq!(message.role, "assistant");
        assert_eq!(message.version_group, id);
        assert!(!message.deprecated);
    }

    #[tokio::test]
    async fn delete_message_removes_only_that_row() {
        let pool = seeded_pool().await;
        let session_id = session_with_character(&pool, "甲").await;
        let first = insert_message(&pool, session_id, "user", "甲")
            .await
            .unwrap();
        insert_message(&pool, session_id, "assistant", "乙")
            .await
            .unwrap();

        delete_message(&pool, first).await.unwrap();

        let list = list_messages(&pool, session_id).await.unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].content, "乙");
    }

    #[tokio::test]
    async fn mark_deprecated_after_flags_later_messages_in_same_session() {
        let pool = seeded_pool().await;
        let session_a = session_with_character(&pool, "甲").await;
        let session_b = session_with_character(&pool, "乙").await;
        let first = insert_message(&pool, session_a, "user", "一").await.unwrap();
        let second = insert_message(&pool, session_a, "assistant", "二").await.unwrap();
        let third = insert_message(&pool, session_a, "user", "三").await.unwrap();
        let other = insert_message(&pool, session_b, "user", "别的会话")
            .await
            .unwrap();

        mark_deprecated_after(&pool, session_a, first).await.unwrap();

        assert!(!get_message(&pool, first).await.unwrap().deprecated);
        assert!(get_message(&pool, second).await.unwrap().deprecated);
        assert!(get_message(&pool, third).await.unwrap().deprecated);
        assert!(!get_message(&pool, other).await.unwrap().deprecated);
    }

    #[tokio::test]
    async fn deprecated_messages_still_appear_in_context_messages() {
        let pool = seeded_pool().await;
        let session_id = session_with_character(&pool, "甲").await;
        let first = insert_message(&pool, session_id, "user", "一").await.unwrap();
        insert_message(&pool, session_id, "assistant", "二")
            .await
            .unwrap();

        mark_deprecated_after(&pool, session_id, first).await.unwrap();

        // deprecated 只是 UI 提示：list_messages 不能因此丢消息（DESIGN 4.2）。
        let list = list_messages(&pool, session_id).await.unwrap();
        assert_eq!(list.len(), 2);
        assert!(list[1].deprecated);
        assert_eq!(list[1].content, "二");
    }

    /// 直接插一个指定 version_group / is_active 的版本，用于构造多版本场景。
    async fn insert_version(
        pool: &SqlitePool,
        session_id: i64,
        content: &str,
        version_group: i64,
        is_active: bool,
    ) -> i64 {
        let result = sqlx::query(
            "INSERT INTO messages (session_id, role, content, version_group, is_active) VALUES (?, 'assistant', ?, ?, ?)",
        )
        .bind(session_id)
        .bind(content)
        .bind(version_group)
        .bind(is_active as i64)
        .execute(pool)
        .await
        .unwrap();
        result.last_insert_rowid()
    }

    #[tokio::test]
    async fn list_versions_returns_all_versions_in_id_order() {
        let pool = seeded_pool().await;
        let session_id = session_with_character(&pool, "甲").await;
        let first = insert_message(&pool, session_id, "assistant", "版本一")
            .await
            .unwrap();
        insert_version(&pool, session_id, "版本二", first, false).await;

        let versions = list_versions(&pool, first).await.unwrap();
        assert_eq!(versions.len(), 2);
        assert_eq!(versions[0].content, "版本一");
        assert_eq!(versions[1].content, "版本二");
        assert!(versions[0].is_active);
        assert!(!versions[1].is_active);
    }

    #[tokio::test]
    async fn activate_version_leaves_exactly_one_active() {
        let pool = seeded_pool().await;
        let session_id = session_with_character(&pool, "甲").await;
        let first = insert_message(&pool, session_id, "assistant", "版本一")
            .await
            .unwrap();
        let second = insert_version(&pool, session_id, "版本二", first, false).await;

        activate_version(&pool, second).await.unwrap();

        let versions = list_versions(&pool, first).await.unwrap();
        let active: Vec<_> = versions.iter().filter(|item| item.is_active).collect();
        assert_eq!(active.len(), 1, "每个 group 恰好一条 is_active");
        assert_eq!(active[0].id, second);
    }

    #[tokio::test]
    async fn activate_version_rejects_missing_message() {
        let pool = seeded_pool().await;
        let session_id = session_with_character(&pool, "甲").await;
        let first = insert_message(&pool, session_id, "assistant", "版本一")
            .await
            .unwrap();

        assert!(activate_version(&pool, 99999).await.is_err());

        // 失败不应留下任何副作用。
        let versions = list_versions(&pool, first).await.unwrap();
        assert_eq!(versions.iter().filter(|item| item.is_active).count(), 1);
        assert!(versions[0].is_active);
    }

    #[tokio::test]
    async fn list_versions_is_scoped_to_one_group() {
        let pool = seeded_pool().await;
        let session_id = session_with_character(&pool, "甲").await;
        let first = insert_message(&pool, session_id, "assistant", "甲组一")
            .await
            .unwrap();
        insert_version(&pool, session_id, "甲组二", first, false).await;
        let other = insert_message(&pool, session_id, "assistant", "乙组一")
            .await
            .unwrap();

        let first_versions = list_versions(&pool, first).await.unwrap();
        assert_eq!(first_versions.len(), 2);
        assert!(first_versions
            .iter()
            .all(|item| item.version_group == first));

        let other_versions = list_versions(&pool, other).await.unwrap();
        assert_eq!(other_versions.len(), 1);
        assert_eq!(other_versions[0].content, "乙组一");
    }

    #[tokio::test]
    async fn insert_message_version_keeps_group_and_is_active() {
        let pool = seeded_pool().await;
        let session_id = session_with_character(&pool, "甲").await;
        let first = insert_message(&pool, session_id, "assistant", "旧版本")
            .await
            .unwrap();

        let new_id =
            insert_message_version(&pool, session_id, "assistant", "新版本", first)
                .await
                .unwrap();

        let message = get_message(&pool, new_id).await.unwrap();
        assert_eq!(message.version_group, first, "新版本应沿用旧 group");
        assert!(message.is_active);
        assert_eq!(message.content, "新版本");
    }

    #[tokio::test]
    async fn deactivate_group_only_touches_that_group() {
        let pool = seeded_pool().await;
        let session_id = session_with_character(&pool, "甲").await;
        let group_a = insert_message(&pool, session_id, "assistant", "甲组")
            .await
            .unwrap();
        insert_version(&pool, session_id, "甲组二", group_a, false).await;
        let group_b = insert_message(&pool, session_id, "assistant", "乙组")
            .await
            .unwrap();

        deactivate_group(&pool, group_a).await.unwrap();

        assert!(list_versions(&pool, group_a)
            .await
            .unwrap()
            .iter()
            .all(|item| !item.is_active));
        assert!(get_message(&pool, group_b).await.unwrap().is_active);
    }

    #[tokio::test]
    async fn list_messages_keeps_regenerated_version_in_original_position() {
        let pool = seeded_pool().await;
        let session_id = session_with_character(&pool, "甲").await;
        let user = insert_message(&pool, session_id, "user", "问")
            .await
            .unwrap();
        let first = insert_message(&pool, session_id, "assistant", "答一")
            .await
            .unwrap();
        // 关键：新版本之后还有别的消息，按 id 排会把新版本甩到最后。
        let later = insert_message(&pool, session_id, "user", "后续")
            .await
            .unwrap();

        // 模拟重新生成：旧版本下线，新版本 id 更大但沿用同一 group。
        deactivate_group(&pool, first).await.unwrap();
        let new_id = insert_message_version(&pool, session_id, "assistant", "答二", first)
            .await
            .unwrap();

        let list = list_messages(&pool, session_id).await.unwrap();
        assert_eq!(list.len(), 3);
        assert_eq!(list[0].id, user);
        assert_eq!(
            list[1].id, new_id,
            "重生成的新版本应留在原位置，而不是排到会话末尾"
        );
        assert_eq!(list[1].version_group, first);
        assert_eq!(list[2].id, later);
    }
}
