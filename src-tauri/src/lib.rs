mod db;

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

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
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
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
