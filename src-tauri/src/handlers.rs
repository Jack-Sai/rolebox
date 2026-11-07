// 全部 #[tauri::command] 集中在此。
// 坑 #15：命令漏注册时编译全绿、前端 invoke 才在运行时炸，
// 因此 lib.rs 的 command_registry_tests 会静态扫描本文件核对注册列表。

use crate::db;
use crate::export;
use crate::models::{
    Character, CharacterInput, Message, Session, SessionInput, StreamEvent, UserPersona,
    UserPersonaInput,
};
use crate::prompt;
use crate::provider;
use crate::stream::Usage;
use crate::AppState;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::ipc::Channel;
use tauri::State;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// 取消标志的键。单人和群聊共用一把 DashMap，前缀必须严格区分。
pub fn cancel_key(session_id: i64) -> String {
    format!("s:{session_id}")
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
pub async fn export_character(
    state: State<'_, AppState>,
    id: i64,
    path: String,
) -> Result<(), String> {
    export::export_character(&state.pool, id, &path).await
}

#[tauri::command]
pub async fn import_character(
    state: State<'_, AppState>,
    path: String,
    mode: String,
) -> Result<Character, String> {
    export::import_character(&state.pool, &path, &mode).await
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

#[tauri::command]
pub async fn get_sessions(
    state: State<'_, AppState>,
    character_id: i64,
) -> Result<Vec<Session>, String> {
    db::list_sessions(&state.pool, character_id).await
}

#[tauri::command]
pub async fn get_session(state: State<'_, AppState>, id: i64) -> Result<Session, String> {
    db::get_session(&state.pool, id).await
}

#[tauri::command]
pub async fn create_session(
    state: State<'_, AppState>,
    input: SessionInput,
) -> Result<Session, String> {
    db::create_session(&state.pool, &input).await
}

#[tauri::command]
pub async fn delete_session(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    db::delete_session(&state.pool, id).await
}

#[tauri::command]
pub async fn get_messages(
    state: State<'_, AppState>,
    session_id: i64,
) -> Result<Vec<Message>, String> {
    db::list_messages(&state.pool, session_id).await
}

/// 发送用户消息，只落库，不触发模型（DESIGN 5.7）。
#[tauri::command]
pub async fn send_user_message(
    state: State<'_, AppState>,
    session_id: i64,
    content: String,
) -> Result<Message, String> {
    let id = db::insert_message(&state.pool, session_id, "user", &content).await?;
    db::get_message(&state.pool, id).await
}

/// 编辑消息：原地改内容，之后的消息标记「上下文已变」——这是用户主动破坏缓存，可接受。
#[tauri::command]
pub async fn update_message(
    state: State<'_, AppState>,
    id: i64,
    content: String,
) -> Result<(), String> {
    let message = db::get_message(&state.pool, id).await?;
    db::update_message(&state.pool, id, &content).await?;
    db::mark_deprecated_after(&state.pool, message.session_id, id).await?;
    Ok(())
}

#[tauri::command]
pub async fn delete_message(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    let message = db::get_message(&state.pool, id).await?;
    db::delete_message(&state.pool, id).await?;
    db::mark_deprecated_after(&state.pool, message.session_id, id).await?;
    Ok(())
}

/// 用户点停止 → 只置标志；流式循环在每个 Delta 之后检查它。
#[tauri::command]
pub async fn cancel_generation(
    state: State<'_, AppState>,
    session_id: i64,
) -> Result<(), String> {
    if let Some(flag) = state.cancel_flags.get(&cancel_key(session_id)) {
        flag.store(true, Ordering::SeqCst);
    }
    Ok(())
}

/// 触发生成。全局一把 send_lock：llama-server 单 slot，会话间并发会互相踩 KV cache。
#[tauri::command]
pub async fn generate_reply(
    state: State<'_, AppState>,
    session_id: i64,
    on_chunk: Channel<StreamEvent>,
) -> Result<Message, String> {
    let _guard = state.send_lock.lock().await;

    let key = cancel_key(session_id);
    let cancel = Arc::new(AtomicBool::new(false));
    state.cancel_flags.insert(key.clone(), cancel.clone());

    let channel = Arc::new(on_chunk);
    let result =
        generate_reply_inner(&state, session_id, channel.clone(), cancel.clone()).await;

    state.cancel_flags.remove(&key);
    if let Err(error) = &result {
        // 取消导致的空内容不算错误，避免重复弹一次 Error 事件。
        if !cancel.load(Ordering::SeqCst) {
            let _ = channel.send(StreamEvent::Error {
                message: error.clone(),
            });
        }
    }
    result
}

async fn generate_reply_inner(
    state: &AppState,
    session_id: i64,
    channel: Arc<Channel<StreamEvent>>,
    cancel: Arc<AtomicBool>,
) -> Result<Message, String> {
    let session = db::get_session(&state.pool, session_id).await?;
    let character = db::get_character(&state.pool, session.character_id).await?;
    let persona = match session.user_persona_id {
        Some(id) => Some(db::get_persona(&state.pool, id).await?),
        None => None,
    };

    // 只要 character / scenario / user_persona 不变，构建结果就字节一致（铁律一）。
    let system_prompt =
        prompt::build_single_system_prompt(&character, &session.scenario, persona.as_ref());
    let messages = db::list_messages(&state.pool, session_id).await?;
    let user_name = persona.as_ref().map(|p| p.name.as_str()).unwrap_or("用户");
    let chat_messages = prompt::format_single_history(
        &system_prompt,
        &messages,
        &character.name,
        user_name,
    );

    let base = state
        .config
        .read()
        .map_err(|_| "读取配置失败".to_string())?
        .server_url
        .clone();
    // 单实例单模型；拿不到模型 id 时 llama.cpp 本地接口不校验 model 字段。
    let model = provider::fetch_model_name(&state.http, &base)
        .await
        .unwrap_or_else(|_| "local-model".to_string());

    let _ = channel.send(StreamEvent::Start { message_id: 0 });

    // 两个回调都要拿到累积文本，用 Arc<Mutex> 共享；Channel 包一层 Arc 便于多闭包持有。
    let buffer = Arc::new(std::sync::Mutex::new(String::new()));
    let delta_buffer = buffer.clone();
    let delta_channel = channel.clone();
    let on_delta = move |text: String| {
        delta_buffer.lock().unwrap().push_str(&text);
        let _ = delta_channel.send(StreamEvent::Delta { content: text });
    };
    let usage_channel = channel.clone();
    let on_usage = move |usage: Usage| {
        let _ = usage_channel.send(StreamEvent::Usage {
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens,
        });
    };

    let stream_result = provider::chat_stream(
        &state.http,
        &base,
        provider::ChatRequest {
            model,
            messages: chat_messages,
            stream: true,
        },
        cancel.clone(),
        on_delta,
        on_usage,
    )
    .await;

    let text = buffer.lock().unwrap().clone();
    let cancelled = cancel.load(Ordering::SeqCst);

    // 取消后仍落库已生成部分（DESIGN 8.2）；完全没内容就不制造空消息。
    let saved = if text.is_empty() {
        None
    } else {
        let id = db::insert_message(&state.pool, session_id, "assistant", &text).await?;
        Some(db::get_message(&state.pool, id).await?)
    };

    if cancelled {
        let _ = channel.send(StreamEvent::Cancelled);
        return saved.ok_or_else(|| "生成已取消且没有可保留的内容".to_string());
    }
    if let Err(error) = &stream_result {
        return Err(error.clone());
    }
    let message = saved.ok_or_else(|| "模型未返回任何内容".to_string())?;
    let _ = channel.send(StreamEvent::Done {
        message: message.clone(),
    });
    Ok(message)
}

#[cfg(test)]
mod tests {
    use super::cancel_key;

    #[test]
    fn single_session_cancel_key_uses_s_prefix() {
        assert_eq!(cancel_key(7), "s:7");
        assert!(cancel_key(7).starts_with("s:"));
        assert!(!cancel_key(7).starts_with("g:"));
    }
}
