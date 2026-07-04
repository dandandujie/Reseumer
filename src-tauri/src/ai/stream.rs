use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};

use futures::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

use super::provider::{AIConfig, ChatMessage, ProviderError, ToolSpec};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum StreamEvent {
    TextDelta { text: String },
    ReasoningDelta { text: String },
    ToolCallStart { id: String, name: String },
    ToolCallArgs { id: String, args: Value },
    ToolResult { id: String, name: String, result: Value },
    Finish { final_text: String },
    Error { message: String },
}

/// Cooperative cancellation — the stop button inserts a stream_id here and
/// every chunk loop polls it between chunks.
static CANCEL_SET: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

fn cancel_set() -> &'static Mutex<HashSet<String>> {
    CANCEL_SET.get_or_init(|| Mutex::new(HashSet::new()))
}

pub fn request_cancel(stream_id: &str) {
    cancel_set().lock().unwrap().insert(stream_id.to_string());
}

pub fn is_cancelled(stream_id: &str) -> bool {
    cancel_set().lock().unwrap().contains(stream_id)
}

pub fn clear_cancel(stream_id: &str) {
    cancel_set().lock().unwrap().remove(stream_id);
}

pub struct ChatStreamResult {
    pub text: String,
    pub tool_calls: Vec<super::provider::ToolCall>,
}

pub async fn stream_chat(
    app: &AppHandle,
    stream_id: &str,
    config: &AIConfig,
    system: &str,
    messages: &[ChatMessage],
    tools: Option<&[ToolSpec]>,
) -> Result<ChatStreamResult, ProviderError> {
    match config.provider.as_str() {
        "anthropic" => stream_anthropic(app, stream_id, config, system, messages, tools).await,
        "gemini" => stream_gemini(app, stream_id, config, system, messages, tools).await,
        _ => stream_openai(app, stream_id, config, system, messages, tools).await,
    }
}

fn emit(app: &AppHandle, stream_id: &str, event: StreamEvent) {
    let payload = json!({ "streamId": stream_id, "event": event });
    let _ = app.emit("ai-chat-event", payload);
}

async fn stream_openai(
    app: &AppHandle,
    stream_id: &str,
    config: &AIConfig,
    system: &str,
    messages: &[ChatMessage],
    tools: Option<&[ToolSpec]>,
) -> Result<ChatStreamResult, ProviderError> {
    let client = super::provider::http_client();
    let url = format!("{}/chat/completions", config.base_url.trim_end_matches('/'));

    let mut msgs: Vec<Value> = Vec::new();
    if !system.is_empty() {
        msgs.push(json!({ "role": "system", "content": system }));
    }
    for m in messages {
        msgs.push(json!({ "role": m.role, "content": m.content }));
    }

    let mut body = json!({
        "model": config.model,
        "messages": msgs,
        "stream": true,
    });

    // Many OpenAI-compatible endpoints default to a tiny completion budget
    // (e.g. 1024) and silently cut replies mid-sentence — always be explicit.
    // o-series / gpt-5 家族 reject max_tokens and want max_completion_tokens.
    let ml = config.model.to_ascii_lowercase();
    if ml.starts_with("o1") || ml.starts_with("o3") || ml.starts_with("o4") || ml.contains("gpt-5") {
        body["max_completion_tokens"] = json!(8192);
    } else {
        body["max_tokens"] = json!(8192);
    }

    if let Some(ts) = tools {
        if !ts.is_empty() {
            body["tools"] = json!(
                ts.iter().map(|t| json!({
                    "type": "function",
                    "function": {
                        "name": t.name,
                        "description": t.description,
                        "parameters": t.parameters,
                    }
                })).collect::<Vec<_>>()
            );
        }
    }

    let res = client
        .post(&url)
        .bearer_auth(&config.api_key)
        .json(&body)
        .send()
        .await?;

    if !res.status().is_success() {
        let status = res.status();
        let txt = res.text().await.unwrap_or_default();
        return Err(ProviderError::Api(format!("{} {}", status, txt)));
    }

    let mut stream = res.bytes_stream();
    let mut buffer = String::new();
    let mut byte_buf: Vec<u8> = Vec::new();
    let mut text_out = String::new();
    let mut tool_calls: Vec<super::provider::ToolCall> = Vec::new();
    // Accumulate tool-call argument strings by index
    let mut pending_tc: std::collections::HashMap<u32, (String, String, String)> = std::collections::HashMap::new();
    // Wire-tap diagnostics: figure out WHY a stream ended.
    let mut frame_count: u64 = 0;
    let mut last_finish_reason: Option<String> = None;
    let mut saw_done = false;
    let mut last_raw_tail = String::new();

    while let Some(chunk) = stream.next().await {
        if is_cancelled(stream_id) {
            break;
        }
        let chunk = chunk?;
        // UTF-8-safe accumulation: a multi-byte char split across network
        // chunks must not be lossy-replaced.
        byte_buf.extend_from_slice(&chunk);
        match std::str::from_utf8(&byte_buf) {
            Ok(text) => {
                buffer.push_str(text);
                byte_buf.clear();
            }
            Err(e) => {
                let valid = e.valid_up_to();
                buffer.push_str(std::str::from_utf8(&byte_buf[..valid]).unwrap_or(""));
                byte_buf.drain(..valid);
            }
        }
        // Normalize CRLF so \r\n\r\n event delimiters parse too.
        if buffer.contains('\r') {
            buffer = buffer.replace("\r\n", "\n");
        }

        while let Some(idx) = buffer.find("\n\n") {
            let line = buffer[..idx].to_string();
            buffer.drain(..idx + 2);

            for l in line.lines() {
                if let Some(data) = l.strip_prefix("data: ").or_else(|| l.strip_prefix("data:")) {
                    frame_count += 1;
                    if data.len() < 400 {
                        last_raw_tail = data.to_string();
                    }
                    if data.trim() == "[DONE]" {
                        saw_done = true;
                        continue;
                    }
                    if let Ok(v) = serde_json::from_str::<Value>(data) {
                        let choice = v.get("choices").and_then(|c| c.get(0)).cloned().unwrap_or(Value::Null);
                        if let Some(fr) = choice.get("finish_reason").and_then(|f| f.as_str()) {
                            last_finish_reason = Some(fr.to_string());
                        }
                        if choice.get("finish_reason").and_then(|f| f.as_str()) == Some("length") {
                            let notice = "\n\n> ⚠️ 输出达到长度上限被截断，可回复“继续”接着生成。";
                            text_out.push_str(notice);
                            emit(app, stream_id, StreamEvent::TextDelta { text: notice.to_string() });
                        }
                        let delta = choice.get("delta").cloned().unwrap_or(Value::Null);

                        if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
                            if !content.is_empty() {
                                text_out.push_str(content);
                                emit(app, stream_id, StreamEvent::TextDelta { text: content.to_string() });
                            }
                        }

                        // Reasoning models (DeepSeek-R1 / QwQ / etc.) stream the
                        // chain-of-thought in reasoning_content (or reasoning);
                        // surface it so the UI can show a collapsible think block.
                        if let Some(reasoning) = delta
                            .get("reasoning_content")
                            .and_then(|c| c.as_str())
                            .or_else(|| delta.get("reasoning").and_then(|c| c.as_str()))
                        {
                            if !reasoning.is_empty() {
                                emit(app, stream_id, StreamEvent::ReasoningDelta { text: reasoning.to_string() });
                            }
                        }

                        if let Some(tcs) = delta.get("tool_calls").and_then(|a| a.as_array()) {
                            for tc in tcs {
                                let idx = tc.get("index").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
                                let entry = pending_tc.entry(idx).or_insert_with(|| (String::new(), String::new(), String::new()));
                                if let Some(id) = tc.get("id").and_then(|v| v.as_str()) {
                                    if entry.0.is_empty() {
                                        entry.0 = id.to_string();
                                    }
                                }
                                if let Some(f) = tc.get("function") {
                                    if let Some(name) = f.get("name").and_then(|v| v.as_str()) {
                                        if entry.1.is_empty() {
                                            entry.1 = name.to_string();
                                            emit(app, stream_id, StreamEvent::ToolCallStart { id: entry.0.clone(), name: name.to_string() });
                                        }
                                    }
                                    if let Some(args) = f.get("arguments").and_then(|v| v.as_str()) {
                                        entry.2.push_str(args);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // End-of-stream forensics: always log how the stream terminated.
    log::info!(
        "openai stream ended: frames={} finish_reason={:?} done_marker={} text_len={} tool_calls={} tail={}",
        frame_count,
        last_finish_reason,
        saw_done,
        text_out.chars().count(),
        pending_tc.len(),
        &last_raw_tail.chars().take(200).collect::<String>()
    );
    // A stream that ends with no finish_reason and no [DONE] was cut upstream
    // (proxy timeout / connection drop) — tell the user instead of silence.
    if !saw_done && last_finish_reason.is_none() && pending_tc.is_empty() && !text_out.is_empty() {
        let notice = "\n\n> ⚠️ 上游连接中断，回复不完整（可能是代理/网关超时）。可回复“继续”接着生成。";
        text_out.push_str(notice);
        emit(app, stream_id, StreamEvent::TextDelta { text: notice.to_string() });
    }
    // Content-filter style stops are otherwise invisible.
    if let Some(fr) = &last_finish_reason {
        if fr != "stop" && fr != "length" && fr != "tool_calls" && fr != "function_call" {
            let notice = format!("\n\n> ⚠️ 生成被上游终止（finish_reason: {fr}）。");
            text_out.push_str(&notice);
            emit(app, stream_id, StreamEvent::TextDelta { text: notice });
        }
    }

    // Finalize tool calls
    let mut indices: Vec<u32> = pending_tc.keys().copied().collect();
    indices.sort();
    for idx in indices {
        let (id, name, args_str) = pending_tc.remove(&idx).unwrap();
        let args: Value = serde_json::from_str(&args_str).unwrap_or(Value::Object(Default::default()));
        emit(app, stream_id, StreamEvent::ToolCallArgs { id: id.clone(), args: args.clone() });
        tool_calls.push(super::provider::ToolCall { id, name, arguments: args });
    }

    Ok(ChatStreamResult { text: text_out, tool_calls })
}

async fn stream_anthropic(
    app: &AppHandle,
    stream_id: &str,
    config: &AIConfig,
    system: &str,
    messages: &[ChatMessage],
    tools: Option<&[ToolSpec]>,
) -> Result<ChatStreamResult, ProviderError> {
    let client = super::provider::http_client();
    let url = format!("{}/v1/messages", config.base_url.trim_end_matches('/').trim_end_matches("/v1"));

    let mut body = json!({
        "model": config.model,
        "max_tokens": 4096,
        "stream": true,
        // Content that parses as a JSON array is passed through as structured
        // blocks (tool_use / tool_result rounds); plain strings stay strings.
        "messages": messages.iter().map(|m| {
            let content = serde_json::from_str::<Value>(&m.content)
                .ok()
                .filter(|v| v.is_array())
                .unwrap_or_else(|| json!(m.content));
            json!({ "role": m.role, "content": content })
        }).collect::<Vec<_>>(),
    });

    if !system.is_empty() {
        body["system"] = json!(system);
    }
    {
        let mut tool_list: Vec<Value> = tools
            .map(|ts| {
                ts.iter()
                    .map(|t| json!({
                        "name": t.name,
                        "description": t.description,
                        "input_schema": t.parameters,
                    }))
                    .collect()
            })
            .unwrap_or_default();
        // Native web search — Anthropic server-side tool.
        if config.web_search_mode == "native" {
            tool_list.push(json!({
                "type": "web_search_20250305",
                "name": "web_search",
                "max_uses": 3,
            }));
        }
        if !tool_list.is_empty() {
            body["tools"] = json!(tool_list);
        }
    }

    let res = client
        .post(&url)
        .header("x-api-key", &config.api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await?;

    if !res.status().is_success() {
        let status = res.status();
        let txt = res.text().await.unwrap_or_default();
        return Err(ProviderError::Api(format!("{} {}", status, txt)));
    }

    let mut stream = res.bytes_stream();
    let mut buffer = String::new();
    let mut text_out = String::new();
    let mut tool_calls: Vec<super::provider::ToolCall> = Vec::new();
    let mut current_tool: Option<(String, String, String)> = None;

    while let Some(chunk) = stream.next().await {
        if is_cancelled(stream_id) {
            break;
        }
        let chunk = chunk?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));
        while let Some(idx) = buffer.find("\n\n") {
            let event_block = buffer[..idx].to_string();
            buffer.drain(..idx + 2);

            for l in event_block.lines() {
                if let Some(data) = l.strip_prefix("data: ") {
                    if let Ok(v) = serde_json::from_str::<Value>(data) {
                        let ev_type = v.get("type").and_then(|s| s.as_str()).unwrap_or("");
                        match ev_type {
                            "content_block_start" => {
                                if let Some(block) = v.get("content_block") {
                                    if block.get("type").and_then(|v| v.as_str()) == Some("tool_use") {
                                        let id = block.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                        let name = block.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                        emit(app, stream_id, StreamEvent::ToolCallStart { id: id.clone(), name: name.clone() });
                                        current_tool = Some((id, name, String::new()));
                                    }
                                }
                            }
                            "content_block_delta" => {
                                if let Some(delta) = v.get("delta") {
                                    let dt = delta.get("type").and_then(|v| v.as_str()).unwrap_or("");
                                    if dt == "text_delta" {
                                        if let Some(t) = delta.get("text").and_then(|v| v.as_str()) {
                                            text_out.push_str(t);
                                            emit(app, stream_id, StreamEvent::TextDelta { text: t.to_string() });
                                        }
                                    } else if dt == "thinking_delta" {
                                        if let Some(t) = delta.get("thinking").and_then(|v| v.as_str()) {
                                            emit(app, stream_id, StreamEvent::ReasoningDelta { text: t.to_string() });
                                        }
                                    } else if dt == "input_json_delta" {
                                        if let Some(part) = delta.get("partial_json").and_then(|v| v.as_str()) {
                                            if let Some((_, _, ref mut acc)) = current_tool {
                                                acc.push_str(part);
                                            }
                                        }
                                    }
                                }
                            }
                            "content_block_stop" => {
                                if let Some((id, name, args_str)) = current_tool.take() {
                                    let args: Value = serde_json::from_str(&args_str).unwrap_or(Value::Object(Default::default()));
                                    emit(app, stream_id, StreamEvent::ToolCallArgs { id: id.clone(), args: args.clone() });
                                    tool_calls.push(super::provider::ToolCall { id, name, arguments: args });
                                }
                            }
                            _ => {}
                        }
                    }
                }
            }
        }
    }

    Ok(ChatStreamResult { text: text_out, tool_calls })
}

async fn stream_gemini(
    app: &AppHandle,
    stream_id: &str,
    config: &AIConfig,
    system: &str,
    messages: &[ChatMessage],
    tools: Option<&[ToolSpec]>,
) -> Result<ChatStreamResult, ProviderError> {
    let client = super::provider::http_client();
    let base = config.base_url.trim_end_matches('/');
    let url = format!(
        "{}/models/{}:streamGenerateContent?alt=sse&key={}",
        base,
        config.model,
        urlencoding::encode(&config.api_key)
    );

    let mut contents: Vec<Value> = Vec::new();
    for m in messages {
        let role = if m.role == "assistant" { "model" } else { "user" };
        contents.push(json!({ "role": role, "parts": [{ "text": m.content }] }));
    }

    let mut body = json!({ "contents": contents });
    if !system.is_empty() {
        body["systemInstruction"] = json!({ "parts": [{ "text": system }] });
    }
    let ml = config.model.to_ascii_lowercase();
    let thinking_capable = ml.contains("2.5") || ml.contains("thinking") || ml.contains("gemini-3") || ml.contains("gemini-exp");
    if thinking_capable {
        // Gemini only returns chain-of-thought when explicitly asked.
        body["generationConfig"] = json!({
            "maxOutputTokens": 8192,
            "thinkingConfig": { "includeThoughts": true }
        });
    } else {
        body["generationConfig"] = json!({ "maxOutputTokens": 8192 });
    }
    {
        let mut tool_list: Vec<Value> = Vec::new();
        if let Some(ts) = tools {
            if !ts.is_empty() {
                tool_list.push(json!({
                    "functionDeclarations": ts.iter().map(|t| json!({
                        "name": t.name,
                        "description": t.description,
                        "parameters": t.parameters,
                    })).collect::<Vec<_>>()
                }));
            }
        }
        // Native web search — Gemini grounding tool. NOTE: some model versions
        // reject mixing googleSearch with functionDeclarations; if the call
        // 400s, switch to the free/tavily engine instead.
        if config.web_search_mode == "native" {
            tool_list.push(json!({ "google_search": {} }));
        }
        if !tool_list.is_empty() {
            body["tools"] = json!(tool_list);
        }
    }

    let res = client
        .post(&url)
        .header("Accept", "text/event-stream")
        .json(&body)
        .send()
        .await?;

    if !res.status().is_success() {
        let status = res.status();
        let txt = res.text().await.unwrap_or_default();
        eprintln!("[gemini stream] HTTP {} body={}", status, txt);
        return Err(ProviderError::Api(format!("{} {}", status, txt)));
    }

    let mut stream = res.bytes_stream();
    let mut buffer = String::new();
    let mut byte_buf: Vec<u8> = Vec::new();
    let mut text_out = String::new();
    let mut tool_calls: Vec<super::provider::ToolCall> = Vec::new();
    let mut chunk_count = 0u32;

    // Line-based SSE parser — robust to \n vs \r\n vs missing trailing newline.
    let process_data = |data: &str,
                            text_out: &mut String,
                            tool_calls: &mut Vec<super::provider::ToolCall>| {
        let data = data.trim();
        if data.is_empty() || data == "[DONE]" {
            return;
        }
        let Ok(v) = serde_json::from_str::<Value>(data) else {
            eprintln!("[gemini stream] failed to parse JSON: {}", data.chars().take(120).collect::<String>());
            return;
        };
        if let Some(fr) = v.pointer("/candidates/0/finishReason").and_then(|f| f.as_str()) {
            if fr != "STOP" {
                let notice = if fr == "MAX_TOKENS" {
                    "\n\n> ⚠️ 输出达到长度上限被截断，可回复“继续”接着生成。".to_string()
                } else {
                    format!("\n\n> ⚠️ 生成被上游终止（finishReason: {fr}）。")
                };
                text_out.push_str(&notice);
                emit(app, stream_id, StreamEvent::TextDelta { text: notice });
            }
            log::info!("gemini stream finishReason={fr}");
        }
        if let Some(parts) = v.pointer("/candidates/0/content/parts").and_then(|p| p.as_array()) {
            for part in parts {
                if let Some(t) = part.get("text").and_then(|v| v.as_str()) {
                    if !t.is_empty() {
                        // Gemini marks chain-of-thought parts with thought=true.
                        if part.get("thought").and_then(|v| v.as_bool()).unwrap_or(false) {
                            emit(app, stream_id, StreamEvent::ReasoningDelta { text: t.to_string() });
                        } else {
                            text_out.push_str(t);
                            emit(app, stream_id, StreamEvent::TextDelta { text: t.to_string() });
                        }
                    }
                }
                if let Some(fc) = part.get("functionCall") {
                    let name = fc.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let arguments = fc.get("args").cloned().unwrap_or(Value::Object(Default::default()));
                    let id = uuid::Uuid::new_v4().to_string();
                    emit(app, stream_id, StreamEvent::ToolCallStart { id: id.clone(), name: name.clone() });
                    emit(app, stream_id, StreamEvent::ToolCallArgs { id: id.clone(), args: arguments.clone() });
                    tool_calls.push(super::provider::ToolCall { id, name, arguments });
                }
            }
        }
    };

    while let Some(chunk) = stream.next().await {
        if is_cancelled(stream_id) {
            break;
        }
        let chunk = chunk?;
        // UTF-8-safe accumulation: a CJK char split across network chunks
        // must not be lossy-corrupted.
        byte_buf.extend_from_slice(&chunk);
        let s: String = match std::str::from_utf8(&byte_buf) {
            Ok(text) => {
                let t = text.to_string();
                byte_buf.clear();
                t
            }
            Err(e) => {
                let valid = e.valid_up_to();
                let t = std::str::from_utf8(&byte_buf[..valid]).unwrap_or("").to_string();
                byte_buf.drain(..valid);
                t
            }
        };
        buffer.push_str(&s);
        chunk_count += 1;
        if chunk_count <= 2 {
            // GOTCHA: never byte-slice streamed text — CJK chars are 3 bytes
            // and a raw &s[..160] panics on a char boundary, killing the
            // whole stream task (this exact bug truncated every 中文 reply).
            let preview: String = s.chars().take(60).collect();
            log::info!("gemini stream chunk #{} len={} preview={:?}", chunk_count, s.len(), preview);
        }

        // Process every complete line in the buffer.
        loop {
            let Some(nl) = buffer.find('\n') else { break };
            let line = buffer[..nl].trim_end_matches('\r').to_string();
            buffer.drain(..nl + 1);
            if let Some(data) = line.strip_prefix("data: ").or_else(|| line.strip_prefix("data:")) {
                process_data(data, &mut text_out, &mut tool_calls);
            }
        }
    }

    // Tail: handle any remaining buffer that didn't end with a newline.
    if !buffer.is_empty() {
        let line = buffer.trim_end_matches('\r');
        if let Some(data) = line.strip_prefix("data: ").or_else(|| line.strip_prefix("data:")) {
            process_data(data, &mut text_out, &mut tool_calls);
        }
    }

    if text_out.is_empty() && tool_calls.is_empty() {
        eprintln!("[gemini stream] empty result after {} chunks", chunk_count);
    }

    Ok(ChatStreamResult {
        text: text_out,
        tool_calls,
    })
}
