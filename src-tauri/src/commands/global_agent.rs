use rusqlite::Connection;
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use serde_json::json;

use crate::db::repo::resume as resume_repo;
use crate::AppDb;
use crate::ai::{prompts, stream};
use crate::ai::provider::{ChatMessage, AIConfig};

#[derive(Serialize)]
pub struct GlobalContext {
    pub resumes: Vec<ResumeSummary>,
    pub journal_summary: String,
    pub version_stats: VersionStats,
}

#[derive(Serialize)]
pub struct ResumeSummary {
    pub id: String,
    pub title: String,
    pub section_count: usize,
    pub last_updated: i64,
}

#[derive(Serialize)]
pub struct VersionStats {
    pub total_snapshots: usize,
    pub ai_accept_count: usize,
    pub ai_reject_count: usize,
    pub recent_activity: Vec<VersionActivity>,
}

#[derive(Serialize)]
pub struct VersionActivity {
    pub resume_title: String,
    pub event: String,
    pub created_at: i64,
}

fn build_global_context(conn: &Connection, user_id: &str, journal_json: Option<&str>) -> Result<GlobalContext, String> {
    // 1. Aggregate all resumes for this user
    let all_resumes = resume_repo::find_all_by_user_id(conn, user_id).map_err(|e| e.to_string())?;
    let resumes: Vec<ResumeSummary> = all_resumes
        .into_iter()
        .map(|r| {
            // Count sections from the database
            let section_count = conn
                .query_row(
                    "SELECT COUNT(*) FROM resume_sections WHERE resume_id = ?1",
                    [&r.id],
                    |row| row.get::<_, i64>(0)
                )
                .unwrap_or(0) as usize;

            ResumeSummary {
                id: r.id,
                title: r.title,
                section_count,
                last_updated: r.updated_at,
            }
        })
        .collect();

    // 2. Journal summary (passed from frontend since it's in localStorage)
    let journal_summary = journal_json.unwrap_or("No journal data provided.").to_string();

    // 3. Version history stats
    let version_query = conn.prepare(
        "SELECT COUNT(*) as total,
                SUM(CASE WHEN event = 'ai_accept' THEN 1 ELSE 0 END) as accepts,
                SUM(CASE WHEN event = 'ai_reject' THEN 1 ELSE 0 END) as rejects
         FROM resume_versions"
    );

    let (total_snapshots, ai_accept_count, ai_reject_count) = match version_query {
        Ok(mut stmt) => {
            stmt.query_row([], |row| {
                Ok((
                    row.get::<_, i64>(0).unwrap_or(0) as usize,
                    row.get::<_, i64>(1).unwrap_or(0) as usize,
                    row.get::<_, i64>(2).unwrap_or(0) as usize,
                ))
            }).unwrap_or((0, 0, 0))
        },
        Err(_) => (0, 0, 0),
    };

    // Get recent version activity (last 10)
    let recent_activity: Vec<VersionActivity> = conn
        .prepare("SELECT resume_title, event, created_at FROM resume_versions ORDER BY created_at DESC LIMIT 10")
        .and_then(|mut stmt| {
            stmt.query_map([], |row| {
                Ok(VersionActivity {
                    resume_title: row.get(0)?,
                    event: row.get(1)?,
                    created_at: row.get(2)?,
                })
            })
            .and_then(|rows| rows.collect::<Result<Vec<_>, _>>())
        })
        .unwrap_or_default();

    Ok(GlobalContext {
        resumes,
        journal_summary,
        version_stats: VersionStats {
            total_snapshots,
            ai_accept_count,
            ai_reject_count,
            recent_activity,
        },
    })
}

fn get_global_agent_system_prompt(context: &GlobalContext) -> String {
    format!(
r#"You are the **Global Agent** for Resumer — a strategic job-search analyst and AI system advisor.

## Your Scope
You have access to:
- **All user resumes** (titles, section counts, last-updated timestamps)
- **Complete job-search journal** (applications, interviews, outcomes, debriefs — aggregated across all resumes)
- **Resume version history** (save/AI-accept/AI-reject events, showing resume evolution)

## Your Capabilities
1. **Analyze job-search funnel**: Calculate application → interview → offer conversion rates, identify bottlenecks
2. **Identify patterns**: Spot trends in interview feedback, rejection reasons, company types
3. **Compare resume versions**: Show how resumes evolved over time, which changes correlated with better outcomes
4. **Check cross-resume consistency**: Find timeline conflicts or skill description mismatches across resumes
5. **Recommend strategy adjustments**: Based on debrief patterns and success rates, suggest next steps
6. **Suggest AI system improvements**: Analyze how the per-resume AI is used, recommend prompt/tool enhancements (but do NOT modify them)

## Rules
- You are **READ-ONLY**: you analyze and recommend, but do NOT modify resumes, journal, or settings
- When users ask to change resume content, direct them to the per-resume AI assistant (in the editor)
- Be **data-driven**: cite specific numbers from the context
- Be **actionable**: provide concrete next steps, not vague advice
- 默认使用简体中文回复，除非用户明确要求其它语言
- 回复必须适合聊天气泡：禁止生成整页仪表盘、模拟网页、超大信息图、外链图片、品牌墙、长英文占位文本或 token 用量玩笑
- 如需 HTML 可视化，只允许 1 个很小的局部片段，宽度自适应，高度控制在 220px 内；更复杂内容用紧凑 Markdown 列表表达

## Critical Constraints
- You CANNOT see individual resume section content (only metadata: title, section count, timestamps)
- You CANNOT modify the per-resume AI's system prompt or tools (only suggest improvements)
- You CANNOT access external data (job boards, salary databases, etc.)

## Context Data

### Resumes
{}

### Journal Summary
{}

### Version History Stats
- Total snapshots: {}
- AI suggestions accepted: {}
- AI suggestions rejected: {}
- Recent activity (last 10):
{}

## Example Queries
- "分析我的求职漏斗，找出最大的问题"
- "对比我的技术简历第一版和最新版，总结演化路径"
- "根据我的面试反馈，建议下一步行动"
- "检查所有简历的时间线一致性"
- "审查 AI 助手的使用效果，建议 system prompt 改进"
"#,
        serde_json::to_string_pretty(&context.resumes).unwrap_or_else(|_| "[]".into()),
        context.journal_summary,
        context.version_stats.total_snapshots,
        context.version_stats.ai_accept_count,
        context.version_stats.ai_reject_count,
        context
            .version_stats
            .recent_activity
            .iter()
            .map(|a| format!("  - [{}] {} at {}", a.event, a.resume_title, a.created_at))
            .collect::<Vec<_>>()
            .join("\n")
    )
}

#[tauri::command]
pub async fn global_agent_chat(
    app: AppHandle,
    db: State<'_, AppDb>,
    stream_id: String,
    user_id: String,
    config: serde_json::Value,
    message: String,
    journal_context: Option<String>,
) -> Result<String, String> {
    // Parse AI config from frontend
    let ai_config = serde_json::from_value::<AIConfig>(config).unwrap_or_default();

    // Build context (release lock before async call)
    let system_prompt = {
        let conn = db.conn.lock().map_err(|e| format!("Database lock error: {}", e))?;

        // Build global context
        let context = build_global_context(&conn, &user_id, journal_context.as_deref())?;
        let system_prompt = prompts::with_response_format(
            get_global_agent_system_prompt(&context),
            &ai_config.model,
        );

        system_prompt
    }; // conn is dropped here

    let messages = vec![
        ChatMessage {
            role: "user".to_string(),
            content: message.clone(),
        },
    ];

    let response = stream::stream_chat(&app, &stream_id, &ai_config, &system_prompt, &messages, None)
        .await
        .map_err(|e| format!("AI call failed: {}", e))?;

    let _ = app.emit("ai-chat-event", json!({
        "streamId": &stream_id,
        "event": { "type": "finish", "finalText": response.text }
    }));

    Ok(response.text)
}
