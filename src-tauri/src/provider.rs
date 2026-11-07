// 铁律二：请求体只允许 model / messages / stream / stream_options，
// 采样参数全部由 llama-server 启动参数决定，客户端一个都不发。
pub use crate::prompt::ChatMessage;

use crate::stream::{process_sse_line, LineOutcome, Usage};
use reqwest::Client;
use serde::Serialize;
use serde_json::Value;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

#[derive(Serialize, Clone, Debug)]
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub stream: bool,
}

/// 抽成纯函数，才能在不起 llama-server 的情况下断言「没有采样参数」。
pub fn build_request_body(req: &ChatRequest) -> Value {
    let mut body = serde_json::Map::new();
    body.insert("model".into(), Value::String(req.model.clone()));
    body.insert(
        "messages".into(),
        serde_json::to_value(&req.messages).unwrap_or(Value::Array(Vec::new())),
    );
    body.insert("stream".into(), Value::Bool(req.stream));
    // 坑 #19：默认不返回 usage，必须显式索要。
    body.insert(
        "stream_options".into(),
        serde_json::json!({ "include_usage": true }),
    );
    Value::Object(body)
}

/// 模型 id 从 server 拿；拿不到时退回占位值，llama.cpp 本地接口不校验 model 字段。
pub async fn fetch_model_name(client: &Client, base: &str) -> Result<String, String> {
    let value: Value = client
        .get(format!("{base}/v1/models"))
        .send()
        .await
        .map_err(|e| format!("获取模型列表失败：{e}"))?
        .error_for_status()
        .map_err(|e| format!("模型列表返回错误：{e}"))?
        .json()
        .await
        .map_err(|e| format!("解析模型列表失败：{e}"))?;

    value
        .get("data")
        .and_then(Value::as_array)
        .and_then(|list| list.first())
        .and_then(|item| item.get("id"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| "模型列表为空或格式异常".to_string())
}

/// 健康检查：GET /health，2xx 即通（DESIGN 5.3）。
pub async fn health(client: &Client, base: &str) -> Result<(), String> {
    let response = client
        .get(format!("{base}/health"))
        .send()
        .await
        .map_err(|e| format!("连接失败：{e}"))?;
    if response.status().is_success() {
        Ok(())
    } else {
        Err(format!("服务返回 HTTP {}", response.status()))
    }
}

/// llama.cpp 的 /props 把 n_ctx 放在 default_generation_settings 下；
/// 不同版本也可能放在顶层，两者都兼容。抽成纯函数以便不起 server 就能测。
pub fn parse_ctx_len(value: &Value) -> Option<u32> {
    value
        .get("default_generation_settings")
        .and_then(|settings| settings.get("n_ctx"))
        .or_else(|| value.get("n_ctx"))
        .and_then(Value::as_u64)
        .filter(|n_ctx| *n_ctx > 0)
        .map(|n_ctx| n_ctx as u32)
}

/// 上下文长度：GET /props，取 n_ctx（DESIGN 5.3）。
pub async fn fetch_ctx_len(client: &Client, base: &str) -> Result<u32, String> {
    let value: Value = client
        .get(format!("{base}/props"))
        .send()
        .await
        .map_err(|e| format!("获取上下文长度失败：{e}"))?
        .error_for_status()
        .map_err(|e| format!("上下文接口返回错误：{e}"))?
        .json()
        .await
        .map_err(|e| format!("解析上下文长度失败：{e}"))?;
    parse_ctx_len(&value).ok_or_else(|| "无法从 /props 读取 n_ctx".to_string())
}

/// POST /v1/chat/completions 并逐行消费 SSE。
/// 取消标志在每个 Delta 之后检查一次；Cancelled / Done 都提前结束读取。
pub async fn chat_stream<D, U>(
    client: &Client,
    base: &str,
    req: ChatRequest,
    cancel: Arc<AtomicBool>,
    mut on_delta: D,
    mut on_usage: U,
) -> Result<(), String>
where
    D: FnMut(String) + Send + 'static,
    U: FnMut(Usage),
{
    let body = build_request_body(&req);
    let mut response = client
        .post(format!("{base}/v1/chat/completions"))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("请求模型失败：{e}"))?;
    if !response.status().is_success() {
        return Err(format!("模型返回 HTTP {}", response.status()));
    }

    // HTTP chunk 边界不等于 SSE 行边界，必须缓冲到完整一行再解析。
    let mut pending = String::new();
    while let Some(bytes) = response
        .chunk()
        .await
        .map_err(|e| format!("读取流失败：{e}"))?
    {
        pending.push_str(&String::from_utf8_lossy(&bytes));
        while let Some(pos) = pending.find('\n') {
            let line: String = pending.drain(..=pos).collect();
            match process_sse_line(
                line.trim(),
                &cancel,
                &mut on_delta,
                &mut on_usage,
            ) {
                LineOutcome::Cancelled | LineOutcome::Done => return Ok(()),
                LineOutcome::Continue => {}
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request() -> ChatRequest {
        ChatRequest {
            model: "local-model".into(),
            messages: vec![ChatMessage {
                role: "user".into(),
                content: "你好".into(),
            }],
            stream: true,
        }
    }

    #[test]
    fn request_body_contains_only_allowed_fields() {
        let body = build_request_body(&request());
        let keys: Vec<&str> = body.as_object().unwrap().keys().map(String::as_str).collect();
        let mut sorted = keys.clone();
        sorted.sort();
        assert_eq!(
            sorted,
            vec!["messages", "model", "stream", "stream_options"]
        );
        assert_eq!(body["stream_options"]["include_usage"], true);
    }

    #[test]
    fn request_body_never_sends_sampling_params() {
        let body = build_request_body(&request());
        for forbidden in [
            "temperature",
            "top_p",
            "top_k",
            "min_p",
            "repeat_penalty",
            "dry",
            "presence_penalty",
            "frequency_penalty",
            "seed",
        ] {
            assert!(
                body.get(forbidden).is_none(),
                "请求体不应包含采样参数 {forbidden}"
            );
        }
    }

    #[test]
    fn model_and_messages_are_forwarded_verbatim() {
        let body = build_request_body(&request());
        assert_eq!(body["model"].as_str(), Some("local-model"));
        assert_eq!(body["stream"].as_bool(), Some(true));
        assert_eq!(body["messages"][0]["role"].as_str(), Some("user"));
        assert_eq!(body["messages"][0]["content"].as_str(), Some("你好"));
    }

    #[test]
    fn parses_nested_n_ctx_from_props() {
        let props = serde_json::json!({
            "default_generation_settings": { "n_ctx": 32768 },
            "total_slots": 1
        });
        assert_eq!(parse_ctx_len(&props), Some(32768));
    }

    #[test]
    fn falls_back_to_top_level_and_rejects_invalid() {
        assert_eq!(parse_ctx_len(&serde_json::json!({ "n_ctx": 4096 })), Some(4096));
        // 0 或负数视为无效，避免进度条出现除以零。
        assert_eq!(parse_ctx_len(&serde_json::json!({ "n_ctx": 0 })), None);
        assert_eq!(parse_ctx_len(&serde_json::json!({})), None);
        assert_eq!(
            parse_ctx_len(&serde_json::json!({ "default_generation_settings": {} })),
            None
        );
    }
}
