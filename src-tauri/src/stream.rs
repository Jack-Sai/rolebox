use serde_json::Value;
use std::sync::atomic::{AtomicBool, Ordering};

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Usage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
}

#[derive(Clone, Debug, PartialEq)]
pub enum SseEvent {
    Delta(String),
    Usage(Usage),
    Done,
}

/// 解析单行 SSE。非标准帧返回 None 让调用方跳过，绝不 panic（DESIGN 5.4）。
pub fn parse_sse_line(line: &str) -> Option<SseEvent> {
    let line = line.trim();
    if line.is_empty() {
        return None;
    }
    let data = line.strip_prefix("data:")?.trim_start();
    if data.is_empty() {
        return None;
    }
    if data == "[DONE]" {
        return Some(SseEvent::Done);
    }

    let value: Value = serde_json::from_str(data).ok()?;

    // 坑 #19：include_usage 的最后一帧是 choices: [] + usage。
    // 必须先取 usage，否则只盯着 delta 的解析会把它当空帧丢掉。
    if let Some(usage) = value.get("usage") {
        return Some(SseEvent::Usage(Usage {
            prompt_tokens: usage
                .get("prompt_tokens")
                .and_then(Value::as_u64)
                .unwrap_or(0) as u32,
            completion_tokens: usage
                .get("completion_tokens")
                .and_then(Value::as_u64)
                .unwrap_or(0) as u32,
        }));
    }

    let content = value
        .get("choices")?
        .as_array()?
        .first()?
        .get("delta")?
        .get("content")?
        .as_str()?;
    Some(SseEvent::Delta(content.to_string()))
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum LineOutcome {
    Continue,
    Cancelled,
    Done,
}

/// 每解析出一个 Delta 就检查一次 cancel，已取消则让调用方提前 break。
/// 抽成纯函数才能在不启动 llama-server 的前提下验证取消逻辑。
pub fn process_sse_line<D, U>(
    line: &str,
    cancel: &AtomicBool,
    on_delta: &mut D,
    on_usage: &mut U,
) -> LineOutcome
where
    D: FnMut(String),
    U: FnMut(Usage),
{
    match parse_sse_line(line) {
        Some(SseEvent::Delta(text)) => {
            on_delta(text);
            if cancel.load(Ordering::SeqCst) {
                LineOutcome::Cancelled
            } else {
                LineOutcome::Continue
            }
        }
        Some(SseEvent::Usage(usage)) => {
            on_usage(usage);
            LineOutcome::Continue
        }
        Some(SseEvent::Done) => LineOutcome::Done,
        None => LineOutcome::Continue,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_delta_frames() {
        assert_eq!(
            parse_sse_line(r#"data: {"choices":[{"delta":{"content":"你"}}]}"#),
            Some(SseEvent::Delta("你".into()))
        );
        // data: 后的空格可有可无，中文内容原样保留。
        assert_eq!(
            parse_sse_line(r#"data:{"choices":[{"delta":{"content":"好"}}]}"#),
            Some(SseEvent::Delta("好".into()))
        );
    }

    #[test]
    fn parses_usage_frame_with_empty_choices() {
        let line = r#"data: {"choices":[],"usage":{"prompt_tokens":100,"completion_tokens":20,"total_tokens":120}}"#;
        assert_eq!(
            parse_sse_line(line),
            Some(SseEvent::Usage(Usage {
                prompt_tokens: 100,
                completion_tokens: 20,
            }))
        );
    }

    #[test]
    fn parses_done_and_skips_blank_or_malformed() {
        assert_eq!(parse_sse_line("data: [DONE]"), Some(SseEvent::Done));
        assert_eq!(parse_sse_line(""), None);
        assert_eq!(parse_sse_line("   "), None);
        assert_eq!(parse_sse_line(": keep-alive"), None);
        assert_eq!(parse_sse_line("data: {不是 JSON"), None);
        assert_eq!(parse_sse_line("data: "), None);
    }

    #[test]
    fn process_sse_line_stops_right_after_cancel() {
        let cancel = AtomicBool::new(true);
        let mut deltas = Vec::new();
        let mut usages = Vec::new();
        let mut on_delta = |text: String| deltas.push(text);
        let mut on_usage = |usage: Usage| usages.push(usage);

        let first = process_sse_line(
            r#"data: {"choices":[{"delta":{"content":"甲"}}]}"#,
            &cancel,
            &mut on_delta,
            &mut on_usage,
        );
        assert_eq!(first, LineOutcome::Cancelled);
        assert_eq!(deltas, vec!["甲"]);

        // 调用方收到 Cancelled 就 break，因此后续帧不应再被处理。
        assert_eq!(deltas.len(), 1);
        assert!(usages.is_empty());
    }

    #[test]
    fn process_sse_line_dispatches_usage_and_done() {
        let cancel = AtomicBool::new(false);
        let mut deltas = Vec::new();
        let mut usages = Vec::new();
        let mut on_delta = |text: String| deltas.push(text);
        let mut on_usage = |usage: Usage| usages.push(usage);

        assert_eq!(
            process_sse_line("data: [DONE]", &cancel, &mut on_delta, &mut on_usage),
            LineOutcome::Done
        );
        assert_eq!(
            process_sse_line(
                r#"data: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":4}}"#,
                &cancel,
                &mut on_delta,
                &mut on_usage,
            ),
            LineOutcome::Continue
        );
        assert_eq!(usages.len(), 1);
        assert_eq!(usages[0].completion_tokens, 4);
        assert!(deltas.is_empty());
    }
}
