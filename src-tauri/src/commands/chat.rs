use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, State};

use crate::ai::provider::{AIConfig, ChatMessage, ToolCall};
use crate::ai::{prompts, stream, tools};
use crate::db::AppDb;
use crate::db::repo::{chat as chat_repo, resume as resume_repo};
use super::CommandError;

const MAX_ROUNDS: usize = 10;
const MAX_STEPS: usize = 25;

fn cfg_from(config: Value) -> AIConfig {
    serde_json::from_value(config).unwrap_or_default()
}

#[tauri::command]
pub async fn list_chat_sessions(
    db: State<'_, AppDb>,
    resume_id: String,
) -> Result<Vec<chat_repo::ChatSession>, CommandError> {
    let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
    chat_repo::find_sessions_by_resume_id(&conn, &resume_id).map_err(Into::into)
}

#[tauri::command]
pub async fn get_chat_session(
    db: State<'_, AppDb>,
    session_id: String,
) -> Result<Option<chat_repo::ChatSession>, CommandError> {
    let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
    chat_repo::find_session(&conn, &session_id).map_err(Into::into)
}

#[tauri::command]
pub async fn list_chat_messages(
    db: State<'_, AppDb>,
    session_id: String,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Value, CommandError> {
    let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
    let limit = limit.unwrap_or(50);
    let offset = offset.unwrap_or(0);
    let total = chat_repo::count_messages(&conn, &session_id)?;
    let messages = chat_repo::find_messages(&conn, &session_id, limit, offset)?;
    Ok(json!({ "total": total, "messages": messages }))
}

#[tauri::command]
pub async fn create_chat_session(
    db: State<'_, AppDb>,
    resume_id: String,
    title: Option<String>,
) -> Result<String, CommandError> {
    let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
    let t = title.unwrap_or_else(|| "新对话".into());
    chat_repo::create_session(&conn, &resume_id, &t).map_err(Into::into)
}

#[tauri::command]
pub async fn delete_chat_session(
    db: State<'_, AppDb>,
    session_id: String,
) -> Result<(), CommandError> {
    let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
    chat_repo::delete_session(&conn, &session_id).map_err(Into::into)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatInputMessage {
    pub role: String,
    pub content: String,
}

#[tauri::command]
pub async fn ai_chat(
    app: AppHandle,
    db: State<'_, AppDb>,
    stream_id: String,
    config: Value,
    messages: Vec<ChatInputMessage>,
    resume_id: Option<String>,
    session_id: Option<String>,
    journal_context: Option<String>,
) -> Result<Value, CommandError> {
    let cfg = cfg_from(config);

    // Save user message and update session title if first
    if let (Some(sid), Some(last)) = (&session_id, messages.last()) {
        if last.role == "user" && !last.content.is_empty() {
            let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
            let existing = chat_repo::find_messages(&conn, sid, 1, 0).unwrap_or_default();
            if existing.is_empty() {
                let title: String = last.content.chars().take(50).collect();
                let _ = chat_repo::update_session_title(&conn, sid, &title);
            }
            let _ = chat_repo::add_message(&conn, sid, "user", &last.content, &json!({}));
        }
    }

    // Build resume context
    let resume_context = if let Some(rid) = &resume_id {
        let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
        if let Ok(Some(r)) = resume_repo::find_by_id_any(&conn, rid) {
            serde_json::to_string(&r.sections).unwrap_or_default()
        } else {
            String::new()
        }
    } else {
        String::new()
    };

    let mut system_prompt = prompts::with_response_format(
        prompts::get_system_prompt(&resume_context),
        &cfg.model,
    );
    if let Some(jc) = &journal_context {
        let trimmed = jc.trim();
        if !trimmed.is_empty() {
            system_prompt.push_str(&format!(
                "\n\n## Resume Journal (user-recorded job-hunt context — optional reference)\n{}",
                trimmed
            ));
        }
    }
    let tool_specs = tools::tool_specs();

    // Truncate messages to last N rounds
    let mut chat_msgs: Vec<ChatMessage> = messages.into_iter()
        .rev()
        .take(MAX_ROUNDS * 2)
        .map(|m| ChatMessage { role: m.role, content: m.content })
        .collect();
    chat_msgs.reverse();

    let mut ordered_parts: Vec<Value> = Vec::new();
    let mut final_text = String::new();

    // Tool-calling loop
    for _step in 0..MAX_STEPS {
        let use_tools = resume_id.is_some();
        let tool_ref = if use_tools { Some(tool_specs.as_slice()) } else { None };

        let res = stream::stream_chat(&app, &stream_id, &cfg, &system_prompt, &chat_msgs, tool_ref)
            .await
            .map_err(|e| CommandError { message: e.to_string() })?;

        if !res.text.is_empty() {
            ordered_parts.push(json!({ "type": "text", "text": res.text }));
            final_text.push_str(&res.text);
        }

        if res.tool_calls.is_empty() {
            break;
        }

        // Execute tools
        let rid = match &resume_id {
            Some(r) => r.clone(),
            None => break,
        };

        let mut tool_results: Vec<(ToolCall, Value)> = Vec::new();
        for tc in &res.tool_calls {
            let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
            let result = tools::execute_tool(&conn, &rid, &tc.name, &tc.arguments);
            drop(conn);
            // Emit tool result event
            let _ = app.emit("ai-chat-event", json!({
                "streamId": &stream_id,
                "event": {
                    "type": "toolResult",
                    "id": tc.id,
                    "name": tc.name,
                    "result": result,
                }
            }));
            ordered_parts.push(json!({
                "type": "tool",
                "toolName": tc.name,
                "args": tc.arguments,
                "result": result,
            }));
            tool_results.push((tc.clone(), result));
        }

        // Append assistant tool-use message and tool results to chat history
        if cfg.provider == "anthropic" {
            // Anthropic needs the assistant message with tool_use content
            let tool_uses: Vec<Value> = res.tool_calls.iter().map(|tc| json!({
                "type": "tool_use",
                "id": tc.id,
                "name": tc.name,
                "input": tc.arguments,
            })).collect();
            let assistant_content = if res.text.is_empty() {
                Value::Array(tool_uses)
            } else {
                let mut parts = vec![json!({ "type": "text", "text": res.text })];
                parts.extend(tool_uses);
                Value::Array(parts)
            };
            chat_msgs.push(ChatMessage { role: "assistant".into(), content: assistant_content.to_string() });

            let user_content: Vec<Value> = tool_results.iter().map(|(tc, r)| json!({
                "type": "tool_result",
                "tool_use_id": tc.id,
                "content": r.to_string(),
            })).collect();
            chat_msgs.push(ChatMessage { role: "user".into(), content: Value::Array(user_content).to_string() });
        } else {
            // OpenAI-compatible: assistant sends tool_calls, then role=tool results
            chat_msgs.push(ChatMessage { role: "assistant".into(), content: res.text.clone() });
            for (tc, r) in &tool_results {
                chat_msgs.push(ChatMessage {
                    role: "tool".into(),
                    content: format!("Tool {} returned: {}", tc.name, r),
                });
            }
        }
    }

    // Persist assistant message
    if let Some(sid) = &session_id {
        if !final_text.is_empty() || ordered_parts.iter().any(|p| p.get("type").and_then(|v| v.as_str()) == Some("tool")) {
            let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
            let metadata = json!({ "orderedParts": ordered_parts });
            let _ = chat_repo::add_message(&conn, sid, "assistant", &final_text, &metadata);
        }
    }

    // Emit finish event
    let _ = app.emit("ai-chat-event", json!({
        "streamId": &stream_id,
        "event": { "type": "finish", "finalText": final_text }
    }));

    Ok(json!({
        "text": final_text,
        "orderedParts": ordered_parts,
    }))
}
