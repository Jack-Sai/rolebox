// 全部 #[tauri::command] 集中在此。
// 坑 #15：命令漏注册时编译全绿、前端 invoke 才在运行时炸，
// 因此 lib.rs 的 command_registry_tests 会静态扫描本文件核对注册列表。

use crate::db;
use crate::export;
use crate::models::{
    Character, CharacterInput, ConnectionInfo, ContextInfo, GroupMember, GroupMessage, GroupSession,
    GroupSessionInput, Message, Session, SessionInput, StreamEvent, UserPersona, UserPersonaInput,
};
use std::collections::HashMap;
use crate::prompt;
use crate::provider;
use crate::stream::Usage;
use crate::{AppConfig, AppState};
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

/// 发送旁白，只落库 role = "narration"，同样不触发模型。
/// 构造上下文时会被转成 user + 【旁白】前缀（format_single_history）。
#[tauri::command]
pub async fn send_narration(
    state: State<'_, AppState>,
    session_id: i64,
    content: String,
) -> Result<Message, String> {
    let id = db::insert_message(&state.pool, session_id, "narration", &content).await?;
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

/// 重新生成某条消息（创建新版本）。与 generate_reply 共用全局 send_lock 与 s:<id> 取消键。
#[tauri::command]
pub async fn regenerate_message(
    state: State<'_, AppState>,
    message_id: i64,
    on_chunk: Channel<StreamEvent>,
) -> Result<Message, String> {
    let _guard = state.send_lock.lock().await;

    let target = db::get_message(&state.pool, message_id).await?;
    let key = cancel_key(target.session_id);
    let cancel = Arc::new(AtomicBool::new(false));
    state.cancel_flags.insert(key.clone(), cancel.clone());

    let channel = Arc::new(on_chunk);
    let result = regenerate_inner(&state, message_id, channel.clone(), cancel.clone()).await;

    state.cancel_flags.remove(&key);
    if let Err(error) = &result {
        if !cancel.load(Ordering::SeqCst) {
            let _ = channel.send(StreamEvent::Error {
                message: error.clone(),
            });
        }
    }
    result
}

#[tauri::command]
pub async fn get_message_versions(
    state: State<'_, AppState>,
    message_id: i64,
) -> Result<Vec<Message>, String> {
    let message = db::get_message(&state.pool, message_id).await?;
    db::list_versions(&state.pool, message.version_group).await
}

#[tauri::command]
pub async fn activate_message_version(
    state: State<'_, AppState>,
    message_id: i64,
) -> Result<(), String> {
    db::activate_version(&state.pool, message_id).await
}

/// 没有真实 usage 时的兜底估算：中文约 1 token/字、英文约 4 字符/token，
/// 取 2 字符/token 折中；每条消息再加 4 个结构性开销（role / 分隔符）。
pub fn estimate_tokens(messages: &[Message]) -> u32 {
    messages
        .iter()
        .map(|message| (message.content.chars().count() as u32 / 2) + 4)
        .sum()
}

/// 压缩上下文：保留最近 4 条，其余交给模型生成摘要，再原子落库（DESIGN 10.2）。
#[tauri::command]
pub async fn compress_context(
    state: State<'_, AppState>,
    session_id: i64,
) -> Result<(), String> {
    // 摘要也是一次模型调用，必须和生成共用同一把锁。
    let _guard = state.send_lock.lock().await;

    let session = db::get_session(&state.pool, session_id).await?;
    let character = db::get_character(&state.pool, session.character_id).await?;
    let persona = match session.user_persona_id {
        Some(id) => Some(db::get_persona(&state.pool, id).await?),
        None => None,
    };

    let messages = db::list_messages(&state.pool, session_id).await?;
    // 已摘要的跳过，摘要消息本身也不参与再次摘要。
    let candidates: Vec<&Message> = messages
        .iter()
        .filter(|item| !item.summarized && item.role != "summary")
        .collect();

    const KEEP_RECENT: usize = 4;
    if candidates.len() <= KEEP_RECENT {
        return Err("消息太少，暂时不需要压缩".to_string());
    }
    let split_at = candidates.len() - KEEP_RECENT;
    let (to_summarize, _keep) = candidates.split_at(split_at);
    let before_id = to_summarize
        .last()
        .map(|item| item.id)
        .ok_or_else(|| "没有可摘要的消息".to_string())?;

    // 摘要 prompt 里要用可读名字，否则模型分不清谁说了什么。
    let user_name = persona.as_ref().map(|p| p.name.as_str()).unwrap_or("用户");
    let pairs: Vec<(String, String)> = to_summarize
        .iter()
        .map(|item| {
            let name = match item.role.as_str() {
                "assistant" => character.name.clone(),
                "narration" => "旁白".to_string(),
                _ => user_name.to_string(),
            };
            (name, item.content.clone())
        })
        .collect();

    let base = state
        .config
        .read()
        .map_err(|_| "读取配置失败".to_string())?
        .server_url
        .clone();
    let model = provider::fetch_model_name(&state.http, &base)
        .await
        .unwrap_or_else(|_| "local-model".to_string());

    // 摘要不需要打字机效果，用闭包把全文收进 buffer 即可。
    let buffer = Arc::new(std::sync::Mutex::new(String::new()));
    let sink = buffer.clone();
    provider::chat_stream(
        &state.http,
        &base,
        provider::ChatRequest {
            model,
            messages: prompt::build_summary_prompt(&pairs),
            stream: true,
        },
        Arc::new(AtomicBool::new(false)),
        move |text| {
            sink.lock().unwrap().push_str(&text);
        },
        |_usage| {},
    )
    .await?;

    let summary = buffer.lock().unwrap().trim().to_string();
    if summary.is_empty() {
        return Err("模型没有返回摘要内容".to_string());
    }

    db::atomic_summarize(&state.pool, session_id, &summary, before_id).await?;
    Ok(())
}

/// 规范化服务器地址：去空白、去结尾斜杠；只剩斜杠或空串直接拒绝。
pub fn normalize_server_url(url: &str) -> Result<String, String> {
    let trimmed = url.trim().trim_end_matches('/').to_string();
    if trimmed.is_empty() {
        return Err("服务器地址不能为空".to_string());
    }
    Ok(trimmed)
}

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<AppConfig, String> {
    let config = state
        .config
        .read()
        .map_err(|_| "读取配置失败".to_string())?;
    Ok(AppConfig {
        server_url: config.server_url.clone(),
    })
}

#[tauri::command]
pub async fn set_server_url(state: State<'_, AppState>, url: String) -> Result<(), String> {
    let normalized = normalize_server_url(&url)?;
    db::set_setting(&state.pool, "server_url", &normalized).await?;
    let mut config = state
        .config
        .write()
        .map_err(|_| "写入配置失败".to_string())?;
    config.server_url = normalized;
    Ok(())
}

/// 连接测试：/health 通就算成功，再尽力补上模型名与上下文长度。
#[tauri::command]
pub async fn test_connection(state: State<'_, AppState>) -> Result<ConnectionInfo, String> {
    let base = state
        .config
        .read()
        .map_err(|_| "读取配置失败".to_string())?
        .server_url
        .clone();

    provider::health(&state.http, &base).await?;
    let model = provider::fetch_model_name(&state.http, &base)
        .await
        .unwrap_or_else(|_| "未知模型".to_string());
    let ctx_length = provider::fetch_ctx_len(&state.http, &base)
        .await
        .unwrap_or(0);

    Ok(ConnectionInfo {
        ok: true,
        model,
        ctx_length,
    })
}

/// 群聊取消键：与单人的 `s:<id>` 共用一个 DashMap，前缀必须区分（DESIGN 坑 #25 同源）。
pub fn group_cancel_key(group_id: i64) -> String {
    format!("g:{group_id}")
}

#[tauri::command]
pub async fn get_group_sessions(state: State<'_, AppState>) -> Result<Vec<GroupSession>, String> {
    db::list_group_sessions(&state.pool).await
}

#[tauri::command]
pub async fn create_group_session(
    state: State<'_, AppState>,
    input: GroupSessionInput,
) -> Result<GroupSession, String> {
    db::create_group_session(&state.pool, &input).await
}

#[tauri::command]
pub async fn delete_group_session(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    db::delete_group_session(&state.pool, id).await
}

#[tauri::command]
pub async fn get_group_members(
    state: State<'_, AppState>,
    group_id: i64,
) -> Result<Vec<GroupMember>, String> {
    db::list_group_members(&state.pool, group_id).await
}

#[tauri::command]
pub async fn get_group_messages(
    state: State<'_, AppState>,
    group_id: i64,
) -> Result<Vec<GroupMessage>, String> {
    db::list_group_messages(&state.pool, group_id).await
}

#[tauri::command]
pub async fn send_group_user_message(
    state: State<'_, AppState>,
    group_id: i64,
    content: String,
) -> Result<GroupMessage, String> {
    let id = db::insert_group_message(&state.pool, group_id, None, "user", &content).await?;
    db::get_group_message(&state.pool, id).await
}

#[tauri::command]
pub async fn send_group_narration(
    state: State<'_, AppState>,
    group_id: i64,
    content: String,
) -> Result<GroupMessage, String> {
    let id = db::insert_group_message(&state.pool, group_id, None, "narration", &content).await?;
    db::get_group_message(&state.pool, id).await
}

#[tauri::command]
pub async fn cancel_group_generation(
    state: State<'_, AppState>,
    group_id: i64,
) -> Result<(), String> {
    if let Some(flag) = state.cancel_flags.get(&group_cancel_key(group_id)) {
        flag.store(true, Ordering::SeqCst);
    }
    Ok(())
}

/// 群聊生成：由前端指定这次要谁发言，同样抢全局 send_lock。
#[tauri::command]
pub async fn generate_group_reply(
    state: State<'_, AppState>,
    group_id: i64,
    character_id: i64,
    on_chunk: Channel<StreamEvent>,
) -> Result<GroupMessage, String> {
    let _guard = state.send_lock.lock().await;

    let key = group_cancel_key(group_id);
    let cancel = Arc::new(AtomicBool::new(false));
    state.cancel_flags.insert(key.clone(), cancel.clone());

    let channel = Arc::new(on_chunk);
    let result =
        generate_group_reply_inner(&state, group_id, character_id, channel.clone(), cancel.clone())
            .await;

    state.cancel_flags.remove(&key);
    if let Err(error) = &result {
        if !cancel.load(Ordering::SeqCst) {
            let _ = channel.send(StreamEvent::Error {
                message: error.clone(),
            });
        }
    }
    result
}

async fn generate_group_reply_inner(
    state: &AppState,
    group_id: i64,
    character_id: i64,
    channel: Arc<Channel<StreamEvent>>,
    cancel: Arc<AtomicBool>,
) -> Result<GroupMessage, String> {
    let group = db::get_group_session(&state.pool, group_id).await?;
    let members = db::list_group_members(&state.pool, group_id).await?;
    if !members
        .iter()
        .any(|member| member.character_id == character_id)
    {
        return Err("该角色不在这个群聊里".to_string());
    }

    let persona = match group.user_persona_id {
        Some(id) => Some(db::get_persona(&state.pool, id).await?),
        None => None,
    };

    // 群聊 prompt 需要每个成员的 tagline 当一句话简介，只能逐个查角色（成员通常 2-4 个）。
    let mut member_rows: Vec<(Character, String)> = Vec::new();
    let mut name_map: HashMap<i64, String> = HashMap::new();
    for member in &members {
        let character = db::get_character(&state.pool, member.character_id).await?;
        let tagline = character.tagline.clone();
        name_map.insert(character.id, character.name.clone());
        member_rows.push((character, tagline));
    }

    let system_prompt =
        prompt::build_group_system_prompt(&member_rows, &group.scenario, persona.as_ref());
    let messages = db::list_group_messages(&state.pool, group_id).await?;
    let user_name = persona.as_ref().map(|p| p.name.as_str()).unwrap_or("用户");
    let mut chat_messages =
        prompt::format_group_history(&system_prompt, &messages, &name_map, user_name);

    let speaker_name = name_map
        .get(&character_id)
        .cloned()
        .unwrap_or_else(|| "该角色".to_string());
    // 当前轮指示只加在末尾，不写入数据库（DESIGN 5.5.5）。
    prompt::append_turn_instruction(&mut chat_messages, &speaker_name);

    let (stream_result, text) =
        stream_chat(state, None, chat_messages, channel.clone(), cancel.clone()).await;
    let cancelled = cancel.load(Ordering::SeqCst);

    // 模型可能不听话自己加 [名字]: 前缀，落库前清掉（DESIGN 5.5.6）。
    let cleaned = prompt::strip_role_prefix(&text, &speaker_name);
    let saved = if cleaned.trim().is_empty() {
        None
    } else {
        let id = db::insert_group_message(
            &state.pool,
            group_id,
            Some(character_id),
            "assistant",
            &cleaned,
        )
        .await?;
        Some(db::get_group_message(&state.pool, id).await?)
    };

    if cancelled {
        let _ = channel.send(StreamEvent::Cancelled);
        return saved.ok_or_else(|| "生成已取消且没有可保留的内容".to_string());
    }
    if let Err(error) = &stream_result {
        return Err(error.clone());
    }
    let message = saved.ok_or_else(|| "模型未返回任何内容".to_string())?;
    let _ = channel.send(StreamEvent::DoneGroup {
        message: message.clone(),
    });
    Ok(message)
}

/// 上下文用量。used 优先用最近一次请求的真实 prompt_tokens（isAccurate = true），
/// 否则按字符数估算（isAccurate = false）。
#[tauri::command]
pub async fn get_context_info(
    state: State<'_, AppState>,
    session_id: i64,
) -> Result<ContextInfo, String> {
    let base = state
        .config
        .read()
        .map_err(|_| "读取配置失败".to_string())?
        .server_url
        .clone();
    // 拿不到 n_ctx 就回落 4096，保证进度条始终有分母。
    let limit = provider::fetch_ctx_len(&state.http, &base)
        .await
        .unwrap_or(4096);
    let messages = db::list_messages(&state.pool, session_id).await?;
    let cached = state.last_usage.get(&session_id).map(|value| *value);
    let (used, is_accurate) = match cached {
        Some(tokens) => (tokens, true),
        None => (estimate_tokens(&messages), false),
    };
    Ok(ContextInfo {
        used,
        limit,
        is_accurate,
    })
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

/// 三个生成入口共用：拿模型名、发 Start、跑 SSE、返回 (流结果, 累积文本)。
async fn stream_chat(
    state: &AppState,
    // 单人会话传 Some(session_id) 用于上下文用量缓存；群聊传 None（避免和 session_id 撞键）。
    usage_key: Option<i64>,
    chat_messages: Vec<prompt::ChatMessage>,
    channel: Arc<Channel<StreamEvent>>,
    cancel: Arc<AtomicBool>,
) -> (Result<(), String>, String) {
    let base = match state.config.read() {
        Ok(config) => config.server_url.clone(),
        Err(_) => return (Err("读取配置失败".to_string()), String::new()),
    };
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
    // 真实 usage 记进 AppState，上下文进度条优先用它（比按字符估算准）。
    let last_usage = state.last_usage.clone();
    let on_usage = move |usage: Usage| {
        if let Some(key) = usage_key {
            last_usage.insert(key, usage.prompt_tokens);
        }
        let _ = usage_channel.send(StreamEvent::Usage {
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens,
        });
    };

    let result = provider::chat_stream(
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
    (result, text)
}

/// 构造单人会话的 system prompt 与历史（generate / regenerate 共用）。
async fn build_single_context(
    state: &AppState,
    session: &Session,
) -> Result<Vec<prompt::ChatMessage>, String> {
    let character = db::get_character(&state.pool, session.character_id).await?;
    let persona = match session.user_persona_id {
        Some(id) => Some(db::get_persona(&state.pool, id).await?),
        None => None,
    };
    // 只要 character / scenario / user_persona 不变，构建结果就字节一致（铁律一）。
    let system_prompt =
        prompt::build_single_system_prompt(&character, &session.scenario, persona.as_ref());
    let messages = db::list_messages(&state.pool, session.id).await?;
    let user_name = persona.as_ref().map(|p| p.name.as_str()).unwrap_or("用户");
    Ok(prompt::format_single_history(
        &system_prompt,
        &messages,
        &character.name,
        user_name,
    ))
}

async fn generate_reply_inner(
    state: &AppState,
    session_id: i64,
    channel: Arc<Channel<StreamEvent>>,
    cancel: Arc<AtomicBool>,
) -> Result<Message, String> {
    let session = db::get_session(&state.pool, session_id).await?;
    let chat_messages = build_single_context(state, &session).await?;
    let (stream_result, text) = stream_chat(
        state,
        Some(session_id),
        chat_messages,
        channel.clone(),
        cancel.clone(),
    )
    .await;
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

/// 重新生成某条消息：用该消息**之前**的历史重新构造 prompt，新版本沿用同一 version_group。
async fn regenerate_inner(
    state: &AppState,
    message_id: i64,
    channel: Arc<Channel<StreamEvent>>,
    cancel: Arc<AtomicBool>,
) -> Result<Message, String> {
    let target = db::get_message(&state.pool, message_id).await?;
    let session = db::get_session(&state.pool, target.session_id).await?;

    let character = db::get_character(&state.pool, session.character_id).await?;
    let persona = match session.user_persona_id {
        Some(id) => Some(db::get_persona(&state.pool, id).await?),
        None => None,
    };
    let system_prompt =
        prompt::build_single_system_prompt(&character, &session.scenario, persona.as_ref());
    let messages = db::list_messages(&state.pool, session.id).await?;
    let user_name = persona.as_ref().map(|p| p.name.as_str()).unwrap_or("用户");
    let history: Vec<Message> = messages
        .into_iter()
        .filter(|item| item.id < target.id)
        .collect();
    let chat_messages = prompt::format_single_history(
        &system_prompt,
        &history,
        &character.name,
        user_name,
    );

    // 旧版本先下线，避免生成期间同一组两条同时 active。
    db::deactivate_group(&state.pool, target.version_group).await?;

    let (stream_result, text) = stream_chat(
        state,
        Some(session.id),
        chat_messages,
        channel.clone(),
        cancel.clone(),
    )
    .await;
    let cancelled = cancel.load(Ordering::SeqCst);

    let saved = if text.is_empty() {
        None
    } else {
        let id = db::insert_message_version(
            &state.pool,
            session.id,
            "assistant",
            &text,
            target.version_group,
        )
        .await?;
        Some(db::get_message(&state.pool, id).await?)
    };

    if saved.is_none() {
        // 没有产出新版本时恢复原版本，否则这一组会没有 is_active。
        let _ = db::activate_version(&state.pool, target.id).await;
    } else {
        db::mark_deprecated_after(&state.pool, session.id, target.id).await?;
    }

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
    use super::{cancel_key, estimate_tokens, group_cancel_key, normalize_server_url};
    use crate::models::Message;

    fn message(content: &str) -> Message {
        Message {
            id: 1,
            session_id: 1,
            role: "user".into(),
            content: content.into(),
            version_group: 1,
            is_active: true,
            deprecated: false,
            summarized: false,
            created_at: "2026-11-07 00:00:00".into(),
        }
    }

    #[test]
    fn estimate_tokens_adds_per_message_overhead() {
        assert_eq!(estimate_tokens(&[]), 0);
        // "你好" 两个字符 / 2 = 1，再加 4 的结构开销。
        assert_eq!(estimate_tokens(&[message("你好")]), 5);
    }

    #[test]
    fn estimate_tokens_grows_with_content_length() {
        let short = estimate_tokens(&[message("短")]);
        let long = estimate_tokens(&[message("这是一个很长很长的句子用来对比估算结果")]);
        assert!(long > short);
    }

    #[test]
    fn single_session_cancel_key_uses_s_prefix() {
        assert_eq!(cancel_key(7), "s:7");
        assert!(cancel_key(7).starts_with("s:"));
        assert!(!cancel_key(7).starts_with("g:"));
    }

    #[test]
    fn normalize_server_url_trims_whitespace_and_trailing_slashes() {
        assert_eq!(
            normalize_server_url("  http://127.0.0.1:8080/  ").unwrap(),
            "http://127.0.0.1:8080"
        );
        assert_eq!(
            normalize_server_url("http://host:8080///").unwrap(),
            "http://host:8080"
        );
        assert!(normalize_server_url("   ").is_err());
        assert!(normalize_server_url("/").is_err());
    }

    #[test]
    fn group_cancel_key_uses_g_prefix() {
        assert_eq!(group_cancel_key(7), "g:7");
        assert!(!group_cancel_key(7).starts_with("s:"));
        // 同一个 id 在单人和群聊里不能撞键，否则取消会串。
        assert_ne!(cancel_key(7), group_cancel_key(7));
    }
}
