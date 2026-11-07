// 全部 #[tauri::command] 集中在此。
// 坑 #15：命令漏注册时编译全绿、前端 invoke 才在运行时炸，
// 因此 lib.rs 的 command_registry_tests 会静态扫描本文件核对注册列表。

use crate::db;
use crate::models::{Character, CharacterInput, UserPersona, UserPersonaInput};
use crate::AppState;
use tauri::State;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// 命令层只做转发与参数校验，数据访问全部交给 db.rs 的纯函数。
#[tauri::command]
pub async fn get_characters(state: State<'_, AppState>) -> Result<Vec<Character>, String> {
    db::list_characters(&state.pool).await
}

#[tauri::command]
pub async fn create_character(
    state: State<'_, AppState>,
    input: CharacterInput,
) -> Result<Character, String> {
    db::create_character(&state.pool, &input).await
}

#[tauri::command]
pub async fn update_character(
    state: State<'_, AppState>,
    id: i64,
    input: CharacterInput,
) -> Result<(), String> {
    db::update_character(&state.pool, id, &input).await
}

#[tauri::command]
pub async fn delete_character(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    db::delete_character(&state.pool, id).await
}

#[tauri::command]
pub async fn get_personas(state: State<'_, AppState>) -> Result<Vec<UserPersona>, String> {
    db::list_personas(&state.pool).await
}

#[tauri::command]
pub async fn create_persona(
    state: State<'_, AppState>,
    input: UserPersonaInput,
) -> Result<UserPersona, String> {
    db::create_persona(&state.pool, &input).await
}

#[tauri::command]
pub async fn update_persona(
    state: State<'_, AppState>,
    id: i64,
    input: UserPersonaInput,
) -> Result<(), String> {
    db::update_persona(&state.pool, id, &input).await
}

#[tauri::command]
pub async fn delete_persona(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    db::delete_persona(&state.pool, id).await
}
