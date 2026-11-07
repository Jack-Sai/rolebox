use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions};
use sqlx::SqlitePool;
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
}
