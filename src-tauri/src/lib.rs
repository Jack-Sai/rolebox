mod db;
pub mod export;
pub mod handlers;
pub mod models;
pub mod prompt;
pub mod provider;
pub mod stream;

use dashmap::DashMap;
use std::sync::{atomic::AtomicBool, Arc, RwLock};

pub const DEFAULT_SERVER_URL: &str = "http://127.0.0.1:8080";

pub struct AppConfig {
    pub server_url: String,
}

pub struct AppState {
    pub pool: sqlx::SqlitePool,
    pub http: reqwest::Client,
    // 单人与群聊共用一把发送锁：llama-server 默认单 slot，并发请求会互相踩 KV cache。
    pub send_lock: tokio::sync::Mutex<()>,
    // key = "s:<session_id>" 或 "g:<group_id>"
    pub cancel_flags: DashMap<String, Arc<AtomicBool>>,
    pub config: RwLock<AppConfig>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            use tauri::Manager;

            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;

            let db_path = data_dir.join("rolebox.db");
            // connect 与读设置在同一个 block_on 里完成，避免连接池跨 runtime 边界。
            let (pool, server_url) = tauri::async_runtime::block_on(async {
                let pool = db::connect(&db_path).await?;
                let url = db::get_setting(&pool, "server_url").await?;
                Ok::<_, String>((pool, url.unwrap_or_else(|| DEFAULT_SERVER_URL.to_string())))
            })
            .map_err(std::io::Error::other)?;

            app.manage(AppState {
                pool,
                http: reqwest::Client::new(),
                send_lock: tokio::sync::Mutex::new(()),
                cancel_flags: DashMap::new(),
                config: RwLock::new(AppConfig { server_url }),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            handlers::greet,
            handlers::get_characters,
            handlers::create_character,
            handlers::update_character,
            handlers::delete_character,
            handlers::get_personas,
            handlers::create_persona,
            handlers::update_persona,
            handlers::delete_persona,
            handlers::export_character,
            handlers::import_character,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod command_registry_tests {
    // 坑 #15：#[tauri::command] 函数即使没人调用也能编译；漏注册只在前端 invoke
    // 运行到那一行才炸。这里把漏注册变成一条会失败的 Rust 单测。
    const HANDLERS: &str = include_str!("handlers.rs");
    const LIB: &str = include_str!("lib.rs");

    const MARKER: &str = "generate_handler![";

    fn declared_commands(source: &str) -> Vec<String> {
        let mut names = Vec::new();
        let mut armed = false;
        for line in source.lines() {
            let text = line.trim();
            if text.starts_with("#[tauri::command") {
                armed = true;
                continue;
            }
            if !armed {
                continue;
            }
            let is_fn_line = text.starts_with("fn ")
                || text.starts_with("async fn ")
                || text.starts_with("pub fn ")
                || text.starts_with("pub async fn ")
                || text.starts_with("pub(crate) fn ")
                || text.starts_with("pub(crate) async fn ");
            if !is_fn_line {
                continue;
            }
            let Some(pos) = text.find("fn ") else {
                continue;
            };
            let name: String = text[pos + 3..]
                .chars()
                .take_while(|c| c.is_ascii_alphanumeric() || *c == '_')
                .collect();
            if !name.is_empty() {
                names.push(name);
                armed = false;
            }
        }
        names
    }

    fn registered_commands(source: &str) -> Vec<String> {
        let Some(start) = source.find(MARKER) else {
            return Vec::new();
        };
        let tail = &source[start + MARKER.len()..];
        let Some(end) = tail.find(']') else {
            return Vec::new();
        };
        tail[..end]
            .split(',')
            .map(|part| part.trim())
            .filter(|part| !part.is_empty())
            .map(|part| part.rsplit("::").next().unwrap_or(part).trim().to_string())
            .collect()
    }

    #[test]
    fn every_tauri_command_is_registered() {
        let declared = declared_commands(HANDLERS);
        assert!(
            !declared.is_empty(),
            "handlers.rs 中应有 #[tauri::command] 函数"
        );

        let registered = registered_commands(LIB);
        for name in declared {
            assert!(
                registered.iter().any(|item| item == &name),
                "命令 {name} 未在 invoke_handler 注册"
            );
        }
    }
}
