//! Mock-interview assistant. Ephemeral (no DB persistence) — the modal passes
//! the full message history each turn. Streams like ai_chat and supports the
//! webSearch tool, but uses an interviewer persona instead of resume tools.

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, State};

use crate::ai::provider::{AIConfig, ChatMessage, ToolSpec};
use crate::ai::{memory, prompts, search, skills, stream};
use crate::ai::memory::MemoryDir;
use crate::ai::skills::SkillsDir;
use crate::db::AppDb;
use crate::db::repo::resume as resume_repo;
use super::CommandError;

fn cfg_from(config: Value) -> AIConfig {
    serde_json::from_value(config).unwrap_or_default()
}

const MAX_STEPS: usize = 4;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InterviewMessage {
    pub role: String,
    pub content: String,
}

#[tauri::command]
pub async fn interview_chat(
    app: AppHandle,
    db: State<'_, AppDb>,
    memory_dir: State<'_, MemoryDir>,
    skills_dir: State<'_, SkillsDir>,
    stream_id: String,
    config: Value,
    messages: Vec<InterviewMessage>,
    resume_id: Option<String>,
    company: Option<String>,
    role: Option<String>,
    jd: Option<String>,
) -> Result<Value, CommandError> {
    let cfg = cfg_from(config);

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

    let directives = memory::read_interview_directives(&memory_dir.0);
    // Share the résumé assistant's skill library (job-profile SOPs etc.) so the
    // Global Agent's saveSkill also improves the interviewer's domain knowledge.
    let skill_index = skills::skill_index_block(&skills_dir.0);
    let system_prompt = prompts::interview_system_prompt(
        &resume_context,
        company.as_deref().unwrap_or(""),
        role.as_deref().unwrap_or(""),
        jd.as_deref().unwrap_or(""),
        &skill_index,
        &directives,
    );

    let mut chat_msgs: Vec<ChatMessage> = messages
        .into_iter()
        .map(|m| ChatMessage { role: m.role, content: m.content })
        .collect();

    // Only the webSearch tool (no resume-editing tools for the interviewer).
    let tool_specs: Vec<ToolSpec> = if search::tool_enabled(&cfg) {
        vec![ToolSpec {
            name: "webSearch".into(),
            description: "联网搜索。用于查询公司背景、行业动态、面试题库、薪资行情等实时信息。返回标题/链接/摘要列表。".into(),
            parameters: json!({
                "type": "object",
                "properties": { "query": { "type": "string", "description": "搜索关键词" } },
                "required": ["query"]
            }),
        }]
    } else {
        Vec::new()
    };

    let mut final_text = String::new();
    let mut usage_total = stream::Usage::default();

    for _step in 0..MAX_STEPS {
        let tool_ref = if tool_specs.is_empty() { None } else { Some(tool_specs.as_slice()) };
        let res = match stream::stream_chat(&app, &stream_id, &cfg, &system_prompt, &chat_msgs, tool_ref).await {
            Ok(r) => r,
            Err(e) => {
                let msg = e.to_string();
                log::error!("interview_chat stream failed: {msg}");
                let _ = app.emit("ai-chat-event", json!({
                    "streamId": &stream_id,
                    "event": { "type": "error", "message": msg }
                }));
                return Err(CommandError { message: msg });
            }
        };

        usage_total.add(&res.usage);
        if !res.text.is_empty() {
            final_text.push_str(&res.text);
        }

        if stream::is_cancelled(&stream_id) {
            break;
        }
        if res.tool_calls.is_empty() {
            break;
        }

        // Execute webSearch tool calls and feed results back as plain text.
        chat_msgs.push(ChatMessage {
            role: "assistant".into(),
            content: if res.text.trim().is_empty() { "（联网检索中）".into() } else { res.text.clone() },
        });
        let mut blocks = Vec::new();
        for tc in &res.tool_calls {
            if tc.name == "webSearch" {
                let query = tc.arguments.get("query").and_then(|v| v.as_str()).unwrap_or("");
                let result = match search::web_search(&cfg, query).await {
                    Ok(v) => v,
                    Err(err) => json!({ "error": err }),
                };
                blocks.push(format!("webSearch({query}) => {result}"));
            }
        }
        chat_msgs.push(ChatMessage {
            role: "user".into(),
            content: format!("[工具执行结果，继续面试]\n{}", blocks.join("\n")),
        });
    }

    stream::clear_cancel(&stream_id);
    let _ = app.emit("ai-chat-event", json!({
        "streamId": &stream_id,
        "event": { "type": "finish", "finalText": final_text }
    }));

    Ok(json!({
        "text": final_text,
        "usage": {
            "promptTokens": usage_total.prompt_tokens,
            "completionTokens": usage_total.completion_tokens,
            "totalTokens": usage_total.total_tokens,
        },
    }))
}

#[tauri::command]
pub async fn get_interview_directives(memory_dir: State<'_, MemoryDir>) -> Result<String, CommandError> {
    Ok(memory::read_interview_directives(&memory_dir.0))
}

#[tauri::command]
pub async fn update_interview_directives(
    memory_dir: State<'_, MemoryDir>,
    content: String,
) -> Result<String, CommandError> {
    memory::update_interview_directives(&memory_dir.0, &content).map_err(|e| CommandError { message: e })
}
