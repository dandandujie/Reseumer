use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, State};

use crate::ai::memory::MemoryDir;
use crate::ai::provider::{AIConfig, ChatMessage, ToolCall};
use crate::ai::skills::SkillsDir;
use crate::ai::{memory, prompts, search, skills, stream, tools};
use crate::browser_driver::BrowserDriver;
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

#[tauri::command]
pub fn cancel_ai_stream(stream_id: String) {
    stream::request_cancel(&stream_id);
}

#[tauri::command]
pub async fn truncate_chat_messages(
    db: State<'_, AppDb>,
    session_id: String,
    message_id: String,
) -> Result<(), CommandError> {
    let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
    chat_repo::truncate_from_message(&conn, &session_id, &message_id).map_err(Into::into)
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
    skills_dir: State<'_, SkillsDir>,
    memory_dir: State<'_, MemoryDir>,
    driver: State<'_, BrowserDriver>,
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

    let skill_index = skills::skill_index_block(&skills_dir.0);
    let global_facts = memory::read_global_facts(&memory_dir.0);
    let assistant_directives = memory::read_assistant_directives(&memory_dir.0);
    let archive_index = {
        let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
        chat_repo::archive_index_block(&conn, 8)
    };
    let mut system_prompt = prompts::with_response_format(
        prompts::get_system_prompt(&resume_context, &skill_index, &global_facts, &archive_index, &assistant_directives),
        &cfg.model,
    );
    // Layered memory L2 — inject the session's working checkpoint so the agent
    // resumes multi-turn tasks even though only recent messages are sent.
    if let Some(sid) = &session_id {
        let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
        if let Ok(cp) = chat_repo::get_checkpoint(&conn, sid) {
            if !cp.trim().is_empty() {
                system_prompt.push_str(&format!(
                    "\n\n## 工作检查点（你在本会话早前记录的任务状态，历史消息可能已截断，以此为准继续）\n{}",
                    cp.trim()
                ));
            }
        }
    }
    if let Some(jc) = &journal_context {
        let trimmed = jc.trim();
        if !trimmed.is_empty() {
            system_prompt.push_str(&format!(
                "\n\n## Resume Journal (user-recorded job-hunt context — optional reference)\n{}",
                trimmed
            ));
        }
    }
    let tool_specs = tools::tool_specs(search::tool_enabled(&cfg));

    // Truncate messages to last N rounds
    let mut chat_msgs: Vec<ChatMessage> = messages.into_iter()
        .rev()
        .take(MAX_ROUNDS * 2)
        .map(|m| ChatMessage { role: m.role, content: m.content })
        .collect();
    chat_msgs.reverse();

    let mut ordered_parts: Vec<Value> = Vec::new();
    let mut final_text = String::new();
    let mut usage_total = crate::ai::stream::Usage::default();

    // Tool-calling loop
    for _step in 0..MAX_STEPS {
        let use_tools = resume_id.is_some();
        let tool_ref = if use_tools { Some(tool_specs.as_slice()) } else { None };

        let res = match stream::stream_chat(&app, &stream_id, &cfg, &system_prompt, &chat_msgs, tool_ref).await {
            Ok(r) => r,
            Err(e) => {
                // Persist whatever already streamed so it survives reloads.
                if let Some(sid) = &session_id {
                    if !final_text.is_empty() || !ordered_parts.is_empty() {
                        if let Ok(conn) = db.conn.lock() {
                            let metadata = json!({ "orderedParts": ordered_parts, "partial": true });
                            let _ = chat_repo::add_message(&conn, sid, "assistant", &final_text, &metadata);
                        }
                    }
                }
                let msg = e.to_string();
                log::error!("ai_chat stream failed: {}", msg);
                let _ = app.emit("ai-chat-event", json!({
                    "streamId": &stream_id,
                    "event": { "type": "error", "message": msg }
                }));
                return Err(CommandError { message: msg });
            }
        };

        usage_total.add(&res.usage);

        if !res.text.is_empty() {
            ordered_parts.push(json!({ "type": "text", "text": res.text }));
            final_text.push_str(&res.text);
        }

        // User pressed stop — keep what we have, skip further rounds.
        if stream::is_cancelled(&stream_id) {
            let notice = "\n\n> ⏹ 已停止生成";
            final_text.push_str(notice);
            ordered_parts.push(json!({ "type": "text", "text": notice }));
            let _ = app.emit("ai-chat-event", json!({
                "streamId": &stream_id,
                "event": { "type": "textDelta", "text": notice }
            }));
            break;
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
            // Async / context-dependent tools are intercepted here; everything
            // else dispatches to the sync executor. GOTCHA: never hold the
            // sqlite Mutex across an await (browserEval).
            let result = match tc.name.as_str() {
                "updateCheckpoint" => {
                    let content = tc.arguments.get("content").and_then(|v| v.as_str()).unwrap_or("");
                    match &session_id {
                        Some(sid) if !content.trim().is_empty() => {
                            let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
                            match chat_repo::update_checkpoint(&conn, sid, content.trim()) {
                                Ok(()) => json!({ "success": true }),
                                Err(e) => json!({ "success": false, "error": e.to_string() }),
                            }
                        }
                        Some(_) => json!({ "success": false, "error": "检查点内容不能为空" }),
                        None => json!({ "success": false, "error": "当前会话不支持检查点" }),
                    }
                }
                "updateGlobalFacts" => {
                    let content = tc.arguments.get("content").and_then(|v| v.as_str()).unwrap_or("");
                    match memory::update_global_facts(&memory_dir.0, content) {
                        Ok(msg) => json!({ "success": true, "message": msg }),
                        Err(e) => json!({ "success": false, "error": e }),
                    }
                }
                "archiveSession" => {
                    let title = tc.arguments.get("title").and_then(|v| v.as_str()).unwrap_or("");
                    let summary = tc.arguments.get("summary").and_then(|v| v.as_str()).unwrap_or("");
                    match (&session_id, title.is_empty() || summary.is_empty()) {
                        (Some(sid), false) => {
                            let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
                            match chat_repo::add_archive(&conn, sid, &rid, title, summary) {
                                Ok(id) => json!({ "success": true, "archiveId": id }),
                                Err(e) => json!({ "success": false, "error": e.to_string() }),
                            }
                        }
                        (Some(_), true) => json!({ "success": false, "error": "title 和 summary 不能为空" }),
                        (None, _) => json!({ "success": false, "error": "当前会话不支持归档" }),
                    }
                }
                "readSessionArchive" => {
                    let aid = tc.arguments.get("archiveId").and_then(|v| v.as_str()).unwrap_or("");
                    let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
                    match chat_repo::get_archive(&conn, aid) {
                        Ok(Some(a)) => json!({ "title": a.title, "summary": a.summary, "scope": a.scope }),
                        Ok(None) => json!({ "success": false, "error": format!("归档不存在：{aid}") }),
                        Err(e) => json!({ "success": false, "error": e.to_string() }),
                    }
                }
                "webSearch" => {
                    let query = tc.arguments.get("query").and_then(|v| v.as_str()).unwrap_or("");
                    match search::web_search(&cfg, query).await {
                        Ok(data) => data,
                        Err(e) => json!({ "success": false, "error": e }),
                    }
                }
                "listBrowserTabs" => json!({ "tabs": driver.list_tabs() }),
                "browserEval" => {
                    let tab_id = tc.arguments.get("tabId").and_then(|v| v.as_str()).unwrap_or("");
                    let script = tc.arguments.get("script").and_then(|v| v.as_str()).unwrap_or("");
                    if script.is_empty() {
                        json!({ "success": false, "error": "script 不能为空" })
                    } else {
                        match driver.eval(tab_id, script).await {
                            Ok(data) => json!({ "success": true, "data": data }),
                            Err(e) => json!({ "success": false, "error": e }),
                        }
                    }
                }
                _ => {
                    let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
                    tools::execute_tool(&conn, &rid, &skills_dir.0, &tc.name, &tc.arguments)
                }
            };
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
            // OpenAI-compatible: a bare role:"tool" message without tool_call_id
            // is rejected (400) by strict endpoints. Feed results back as a
            // plain user block instead — provider-agnostic and always valid.
            let assistant_text = if res.text.trim().is_empty() {
                "（调用工具中）".to_string()
            } else {
                res.text.clone()
            };
            chat_msgs.push(ChatMessage { role: "assistant".into(), content: assistant_text });
            let blocks = tool_results
                .iter()
                .map(|(tc, r)| format!("Tool {} returned: {}", tc.name, r))
                .collect::<Vec<_>>()
                .join("\n");
            chat_msgs.push(ChatMessage {
                role: "user".into(),
                content: format!("[工具执行结果，继续你的任务]\n{}", blocks),
            });
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

    stream::clear_cancel(&stream_id);

    // Emit finish event
    let _ = app.emit("ai-chat-event", json!({
        "streamId": &stream_id,
        "event": { "type": "finish", "finalText": final_text }
    }));

    Ok(json!({
        "text": final_text,
        "orderedParts": ordered_parts,
        "usage": {
            "promptTokens": usage_total.prompt_tokens,
            "completionTokens": usage_total.completion_tokens,
            "totalTokens": usage_total.total_tokens,
        },
    }))
}
