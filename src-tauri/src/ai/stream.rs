use futures::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

use super::provider::{AIConfig, ChatMessage, ProviderError, ToolSpec};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum StreamEvent {
    TextDelta { text: String },
    ToolCallStart { id: String, name: String },
    ToolCallArgs { id: String, args: Value },
    ToolResult { id: String, name: String, result: Value },
    StepComplete,
    Finish { final_text: String },
    Error { message: String },
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
    let mut text_out = String::new();
    let mut tool_calls: Vec<super::provider::ToolCall> = Vec::new();
    // Accumulate tool-call argument strings by index
    let mut pending_tc: std::collections::HashMap<u32, (String, String, String)> = std::collections::HashMap::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(idx) = buffer.find("\n\n") {
            let line = buffer[..idx].to_string();
            buffer.drain(..idx + 2);

            for l in line.lines() {
                if let Some(data) = l.strip_prefix("data: ") {
                    if data.trim() == "[DONE]" {
                        continue;
                    }
                    if let Ok(v) = serde_json::from_str::<Value>(data) {
                        let choice = v.get("choices").and_then(|c| c.get(0)).cloned().unwrap_or(Value::Null);
                        let delta = choice.get("delta").cloned().unwrap_or(Value::Null);

                        if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
                            if !content.is_empty() {
                                text_out.push_str(content);
                                emit(app, stream_id, StreamEvent::TextDelta { text: content.to_string() });
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
        "messages": messages.iter().map(|m| json!({ "role": m.role, "content": m.content })).collect::<Vec<_>>(),
    });

    if !system.is_empty() {
        body["system"] = json!(system);
    }
    if let Some(ts) = tools {
        if !ts.is_empty() {
            body["tools"] = json!(
                ts.iter().map(|t| json!({
                    "name": t.name,
                    "description": t.description,
                    "input_schema": t.parameters,
                })).collect::<Vec<_>>()
            );
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
    // Gemini streaming response parsing is complex — fallback to non-streaming and emit all at once
    let req = super::provider::GenerateRequest {
        config,
        system: if system.is_empty() { None } else { Some(system) },
        messages,
        tools,
        json_mode: false,
        max_tokens: Some(4096),
    };
    let res = super::provider::generate(req).await?;
    if !res.text.is_empty() {
        emit(app, stream_id, StreamEvent::TextDelta { text: res.text.clone() });
    }
    for tc in &res.tool_calls {
        emit(app, stream_id, StreamEvent::ToolCallStart { id: tc.id.clone(), name: tc.name.clone() });
        emit(app, stream_id, StreamEvent::ToolCallArgs { id: tc.id.clone(), args: tc.arguments.clone() });
    }
    Ok(ChatStreamResult {
        text: res.text,
        tool_calls: res.tool_calls,
    })
}
