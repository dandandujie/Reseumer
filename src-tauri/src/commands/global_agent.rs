use rusqlite::Connection;
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use serde_json::json;

use crate::db::repo::{chat as chat_repo, resume as resume_repo};
use crate::AppDb;
use crate::ai::memory::MemoryDir;
use crate::ai::skills::SkillsDir;
use crate::ai::{memory, prompts, search, skills, stream};
use crate::ai::provider::{AIConfig, ChatMessage, ToolSpec};

const MAX_AGENT_STEPS: usize = 8;
const HISTORY_MESSAGES: i64 = 16;

fn agent_tool_specs(web_search_enabled: bool) -> Vec<ToolSpec> {
    let mut specs = vec![
        ToolSpec {
            name: "listSkills".into(),
            description: "列出技能库（SOP 记忆）中所有可用技能及摘要。".into(),
            parameters: json!({ "type": "object", "properties": {}, "required": [] }),
        },
        ToolSpec {
            name: "readSkill".into(),
            description: "读取一个技能的完整内容（如岗位画像 profile-*、方法 SOP sop-*）。给出行业/渠道策略建议前先读相关画像。".into(),
            parameters: json!({
                "type": "object",
                "properties": { "name": { "type": "string", "description": "技能名，如 profile-finance" } },
                "required": ["name"]
            }),
        },
        ToolSpec {
            name: "updateCheckpoint".into(),
            description: "更新本会话的工作检查点（跨轮持续记忆）：[目标] | [关键结论] | [待跟进]。压缩记录，500 字内。".into(),
            parameters: json!({
                "type": "object",
                "properties": { "content": { "type": "string" } },
                "required": ["content"]
            }),
        },
        ToolSpec {
            name: "updateGlobalFacts".into(),
            description: "更新 L2 全局事实（跨会话稳定记忆，全文覆盖式）：用户求职目标、年限、行业、偏好、硬约束。临时结论进检查点，稳定事实进这里。2000 字内。".into(),
            parameters: json!({
                "type": "object",
                "properties": { "content": { "type": "string", "description": "完整内容（覆盖旧值，须保留仍有效的旧事实）" } },
                "required": ["content"]
            }),
        },
        ToolSpec {
            name: "archiveSession".into(),
            description: "L4 会话归档：一次咨询/分析收尾时提炼归档（问题、结论、建议的行动）。".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "title": { "type": "string" },
                    "summary": { "type": "string", "description": "600 字内" },
                },
                "required": ["title", "summary"]
            }),
        },
        ToolSpec {
            name: "readSessionArchive".into(),
            description: "读取一条 L4 会话归档的完整摘要（索引见系统提示词）。".into(),
            parameters: json!({
                "type": "object",
                "properties": { "archiveId": { "type": "string" } },
                "required": ["archiveId"]
            }),
        },
        ToolSpec {
            name: "saveSkill".into(),
            description: "直接修改/新增技能库文件（AI 助手的 L3 知识：岗位画像 profile-*、方法 SOP sop-*）。发现助手表现问题源于技能内容缺陷时，读取原文→修订→整体覆盖保存。名称只含字母数字连字符下划线。".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "name": { "type": "string", "description": "技能名 slug" },
                    "content": { "type": "string", "description": "完整 markdown（覆盖式）" },
                },
                "required": ["name", "content"]
            }),
        },
        ToolSpec {
            name: "readAssistantDirectives".into(),
            description: "读取当前对简历 AI 助手下发的调优指令全文（修改前必读，保留仍有效的旧指令）。".into(),
            parameters: json!({ "type": "object", "properties": {}, "required": [] }),
        },
        ToolSpec {
            name: "updateAssistantDirectives".into(),
            description: "直接调优简历 AI 助手：写入的指令会注入它每一次对话的系统提示词（全文覆盖式）。用于纠正你从数据中发现的行为问题（如：采纳率低的改写风格、用户反复手动修正的表达习惯）。每条指令附一行依据。8KB 内。".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "content": { "type": "string", "description": "调优指令完整 markdown（覆盖旧值，须保留仍有效的旧指令）" },
                },
                "required": ["content"]
            }),
        },
    ];
    if web_search_enabled {
        specs.push(ToolSpec {
            name: "webSearch".into(),
            description: "联网搜索。用于查询实时信息：公司背景、招聘行情、行业节奏等。返回标题/链接/摘要；引用时注明来源。".into(),
            parameters: json!({
                "type": "object",
                "properties": { "query": { "type": "string" } },
                "required": ["query"]
            }),
        });
    }
    specs
}

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

fn get_global_agent_system_prompt(context: &GlobalContext, skill_index: &str, global_facts: &str, archive_index: &str) -> String {
    format!(
r#"你是 Resumer 的**全局 Agent**——一位深谙中国就业市场的求职策略顾问，横跨用户的所有简历、投递记录和版本历史做全局分析。

## 五层记忆（L0-L4）
- L0 元规则：本提示词规则；L1 索引：下方技能/归档索引；L2 全局事实（updateGlobalFacts 维护，用户透露稳定信息立即记入）；L3 技能库（listSkills/readSkill，给行业策略建议前先读对应画像）；L4 会话归档（archiveSession 收尾归档 / readSessionArchive 回忆）。
- 工作检查点（会话内，updateCheckpoint）：临时结论进检查点，稳定事实进 L2，咨询结论进 L4。

### L1 索引 — 技能库
{skill_index}

### L1 索引 — 近期归档
{archive_index}

### L2 全局事实（当前值）
{global_facts}

## 你的数据范围
- **全部简历**（标题、模块数、最后更新时间）
- **完整求职日志**（投递、面试、结果、复盘——跨简历聚合）
- **简历版本历史**（保存 / AI 采纳 / AI 拒绝事件，反映简历演化）

## 中国求职市场知识（分析时作为参照系）
- **节奏**：社招高峰为金三银四、金九银十；校招秋招 9-11 月（提前批 7-8 月）、春招 3-4 月为补录。淡季（如 12-1 月）回复率整体偏低，漏斗数据要按季节校准，不要误判为简历问题。
- **渠道特性**：Boss直聘（直聊为主，中小厂响应快，需主动开聊）、猎聘（中高端/猎头岗）、拉勾（互联网垂直）、智联/前程无忧（传统行业）、内推（大厂通过率最高的渠道）、脉脉（人脉+内推线索）。同一简历在不同渠道表现差异大，建议用户记录投递渠道以便归因。
- **漏斗基准**（用于诊断瓶颈，非绝对标准）：投递→初筛通过约 10-20%（低于 10% 通常是简历关键词/定位问题）；初筛→一面约 50-70%；一面→终面约 30-50%；终面→offer 约 30-50%。投递后超过 2 周无回复可视为默拒。
- **归因逻辑**：投递多但初筛少 → 简历或投递定位问题（建议做 JD 匹配分析）；初筛多但一面挂 → 基础技能表达与简历不符或面试表现；终面挂 → 匹配度/薪资/竞争者因素，不一定是候选人问题。

## 你的能力
1. **求职漏斗分析**：计算 投递→面试→offer 转化率，对照上方基准定位瓶颈环节
2. **模式识别**：从面试反馈、拒绝原因、公司类型中发现趋势（如"总在系统设计环节挂"）
3. **版本对比**：分析简历演化路径，哪些改动与更好的结果相关
4. **跨简历一致性检查**：发现时间线冲突、技能描述不一致（背调风险点）
5. **策略调整建议**：基于复盘模式与转化数据，给出下一步行动（换渠道/改简历/调整目标岗位层级）
6. **直接优化 AI 助手**（你的核心权限）：单简历 AI 助手只服务单份简历、彼此不互通——只有你站在全局，看得到它的整体表现（版本历史中的 AI 采纳/拒绝率、用户复盘反馈、跨简历模式）。发现系统性问题时**直接动手修**，不是只给用户提建议：
   - **updateAssistantDirectives**：向助手下发行为调优指令（注入它每次对话的提示词）。适用：改写风格被频繁拒绝、用户总在手动改某类表达、语气/详略偏好。
   - **saveSkill**：直接修订技能库（岗位画像/SOP）。适用：某画像知识过时或有错、SOP 流程缺步骤。
   - 修改纪律：改前先读原文（readAssistantDirectives / readSkill）；每条指令写明数据依据（如"近10次经历改写被拒6次，因为..."）；改完用一句话告知用户改了什么、为什么；无充分数据支撑时不要凭空修改。

## 规则
- 对简历内容和求职日志你是只读的：用户要改简历内容时，引导其到编辑器内的 AI 助手
- 对 AI 助手本身（调优指令、技能库）你有直接写权限——用数据说话，小步修改
- **数据驱动**：引用上下文中的具体数字，对照漏斗基准给结论
- **可执行**：给具体下一步（"本周内推 3 个 XX 岗"），不给空泛建议（"多投简历"）
- 默认使用简体中文回复，除非用户明确要求其它语言
- 回复必须适合聊天气泡：禁止生成整页仪表盘、模拟网页、超大信息图、外链图片、品牌墙、长英文占位文本或 token 用量玩笑
- 如需 HTML 可视化，只允许 1 个很小的局部片段，宽度自适应，高度控制在 220px 内；更复杂内容用紧凑 Markdown 列表表达

## 硬性限制
- 你看不到简历模块的具体内容（只有元数据：标题、模块数、时间戳）
- 工具列表中有 webSearch 时可联网查询实时信息（引用需注明来源）；没有该工具时不得虚构外部数据，涉及薪资行情要说明是经验参考

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
- "现在是几月，我该主攻哪些渠道？"
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
            .join("\n"),
        skill_index = if skill_index.is_empty() { "  （技能库为空）" } else { skill_index },
        archive_index = if archive_index.is_empty() { "  （暂无归档）" } else { archive_index },
        global_facts = if global_facts.trim().is_empty() { "（尚未记录）" } else { global_facts.trim() },
    )
}

#[tauri::command]
pub async fn global_agent_chat(
    app: AppHandle,
    db: State<'_, AppDb>,
    skills_dir: State<'_, SkillsDir>,
    memory_dir: State<'_, MemoryDir>,
    stream_id: String,
    user_id: String,
    config: serde_json::Value,
    message: String,
    journal_context: Option<String>,
    session_id: Option<String>,
) -> Result<serde_json::Value, String> {
    // Parse AI config from frontend
    let ai_config = serde_json::from_value::<AIConfig>(config).unwrap_or_default();

    let mut user_msg_id: Option<String> = None;
    let mut assistant_msg_id: Option<String> = None;

    // Persist the user message + build system prompt & history (lock scope).
    let (system_prompt, mut chat_msgs) = {
        let conn = db.conn.lock().map_err(|e| format!("Database lock error: {}", e))?;

        if let Some(sid) = &session_id {
            let existing = chat_repo::find_messages(&conn, sid, 1, 0).unwrap_or_default();
            if existing.is_empty() {
                let title: String = message.chars().take(50).collect();
                let _ = chat_repo::update_session_title(&conn, sid, &title);
            }
            user_msg_id = chat_repo::add_message(&conn, sid, "user", &message, &json!({})).ok();
        }

        let context = build_global_context(&conn, &user_id, journal_context.as_deref())?;
        let global_facts = memory::read_global_facts(&memory_dir.0);
        let archive_index = chat_repo::archive_index_block(&conn, 8);
        let mut system_prompt = prompts::with_response_format(
            get_global_agent_system_prompt(
                &context,
                &skills::skill_index_block(&skills_dir.0),
                &global_facts,
                &archive_index,
            ),
            &ai_config.model,
        );
        if let Some(sid) = &session_id {
            if let Ok(cp) = chat_repo::get_checkpoint(&conn, sid) {
                if !cp.trim().is_empty() {
                    system_prompt.push_str(&format!(
                        "\n\n## 工作检查点（你在本会话早前记录的状态，以此为准继续）\n{}",
                        cp.trim()
                    ));
                }
            }
        }

        // Conversation history from the session (includes the just-saved user
        // message); fallback to the single incoming message.
        let history: Vec<ChatMessage> = if let Some(sid) = &session_id {
            let total = chat_repo::count_messages(&conn, sid).unwrap_or(0);
            let offset = (total - HISTORY_MESSAGES).max(0);
            chat_repo::find_messages(&conn, sid, HISTORY_MESSAGES, offset)
                .unwrap_or_default()
                .into_iter()
                .filter(|m| m.role == "user" || m.role == "assistant")
                .map(|m| ChatMessage { role: m.role, content: m.content })
                .collect()
        } else {
            Vec::new()
        };
        let msgs = if history.is_empty() {
            vec![ChatMessage { role: "user".into(), content: message.clone() }]
        } else {
            history
        };

        (system_prompt, msgs)
    }; // conn dropped

    // Autonomous loop — skills/checkpoint tools, GenericAgent-style.
    let tool_specs = agent_tool_specs(search::tool_enabled(&ai_config));
    let mut final_text = String::new();

    for _step in 0..MAX_AGENT_STEPS {
        let response = match stream::stream_chat(
            &app,
            &stream_id,
            &ai_config,
            &system_prompt,
            &chat_msgs,
            Some(tool_specs.as_slice()),
        )
        .await
        {
            Ok(r) => r,
            Err(e) => {
                // A later round failing must not vaporize what already streamed:
                // persist the partial reply so it survives session switches.
                if let Some(sid) = &session_id {
                    if !final_text.is_empty() {
                        if let Ok(conn) = db.conn.lock() {
                            let _ = chat_repo::add_message(&conn, sid, "assistant", &final_text, &json!({ "partial": true }));
                        }
                    }
                }
                let msg = format!("AI call failed: {}", e);
                log::error!("global_agent_chat: {}", msg);
                let _ = app.emit("ai-chat-event", json!({
                    "streamId": &stream_id,
                    "event": { "type": "error", "message": msg }
                }));
                return Err(msg);
            }
        };

        if !response.text.is_empty() {
            final_text.push_str(&response.text);
        }
        if stream::is_cancelled(&stream_id) {
            let notice = "\n\n> ⏹ 已停止生成";
            final_text.push_str(notice);
            let _ = app.emit("ai-chat-event", json!({
                "streamId": &stream_id,
                "event": { "type": "textDelta", "text": notice }
            }));
            break;
        }
        if response.tool_calls.is_empty() {
            break;
        }

        let mut tool_blocks: Vec<String> = Vec::new();
        for tc in &response.tool_calls {
            let result = match tc.name.as_str() {
                "listSkills" => json!({
                    "skills": skills::skill_index(&skills_dir.0)
                        .into_iter()
                        .map(|(name, summary)| json!({ "name": name, "summary": summary }))
                        .collect::<Vec<_>>()
                }),
                "readSkill" => {
                    let name = tc.arguments.get("name").and_then(|v| v.as_str()).unwrap_or("");
                    match skills::read_skill(&skills_dir.0, name) {
                        Ok(content) => json!({ "name": name, "content": content }),
                        Err(e) => json!({ "success": false, "error": e }),
                    }
                }
                "updateCheckpoint" => {
                    let content = tc.arguments.get("content").and_then(|v| v.as_str()).unwrap_or("");
                    match (&session_id, content.trim().is_empty()) {
                        (Some(sid), false) => {
                            let conn = db.conn.lock().map_err(|e| e.to_string())?;
                            match chat_repo::update_checkpoint(&conn, sid, content.trim()) {
                                Ok(()) => json!({ "success": true }),
                                Err(e) => json!({ "success": false, "error": e.to_string() }),
                            }
                        }
                        _ => json!({ "success": false, "error": "无会话或内容为空" }),
                    }
                }
                "webSearch" => {
                    let query = tc.arguments.get("query").and_then(|v| v.as_str()).unwrap_or("");
                    match search::web_search(&ai_config, query).await {
                        Ok(data) => data,
                        Err(e) => json!({ "success": false, "error": e }),
                    }
                }
                "saveSkill" => {
                    let name = tc.arguments.get("name").and_then(|v| v.as_str()).unwrap_or("");
                    let content = tc.arguments.get("content").and_then(|v| v.as_str()).unwrap_or("");
                    match skills::save_skill(&skills_dir.0, name, content) {
                        Ok(msg) => json!({ "success": true, "message": msg }),
                        Err(e) => json!({ "success": false, "error": e }),
                    }
                }
                "readAssistantDirectives" => {
                    let content = memory::read_assistant_directives(&memory_dir.0);
                    json!({ "content": if content.trim().is_empty() { "（暂无指令）".to_string() } else { content } })
                }
                "updateAssistantDirectives" => {
                    let content = tc.arguments.get("content").and_then(|v| v.as_str()).unwrap_or("");
                    match memory::update_assistant_directives(&memory_dir.0, content) {
                        Ok(msg) => json!({ "success": true, "message": msg }),
                        Err(e) => json!({ "success": false, "error": e }),
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
                            let conn = db.conn.lock().map_err(|e| e.to_string())?;
                            match chat_repo::add_archive(&conn, sid, "__global__", title, summary) {
                                Ok(id) => json!({ "success": true, "archiveId": id }),
                                Err(e) => json!({ "success": false, "error": e.to_string() }),
                            }
                        }
                        (Some(_), true) => json!({ "success": false, "error": "title/summary 不能为空" }),
                        (None, _) => json!({ "success": false, "error": "当前会话不支持归档" }),
                    }
                }
                "readSessionArchive" => {
                    let aid = tc.arguments.get("archiveId").and_then(|v| v.as_str()).unwrap_or("");
                    let conn = db.conn.lock().map_err(|e| e.to_string())?;
                    match chat_repo::get_archive(&conn, aid) {
                        Ok(Some(a)) => json!({ "title": a.title, "summary": a.summary, "scope": a.scope }),
                        Ok(None) => json!({ "success": false, "error": format!("归档不存在：{aid}") }),
                        Err(e) => json!({ "success": false, "error": e.to_string() }),
                    }
                }
                other => json!({ "success": false, "error": format!("Unknown tool: {other}") }),
            };
            // Surface the tool execution in the chat UI.
            let _ = app.emit("ai-chat-event", json!({
                "streamId": &stream_id,
                "event": { "type": "toolResult", "id": tc.id, "name": tc.name, "result": result }
            }));
            tool_blocks.push(format!("Tool {} returned: {}", tc.name, result));
        }

        // Provider-agnostic tool feedback: plain user-role block (we don't
        // replay native tool_use/tool_result protocol in this simple loop).
        // Empty assistant content is rejected by anthropic/gemini/strict
        // endpoints — substitute a placeholder when the round was tool-only.
        let assistant_text = if response.text.trim().is_empty() {
            "（调用工具中）".to_string()
        } else {
            response.text.clone()
        };
        chat_msgs.push(ChatMessage { role: "assistant".into(), content: assistant_text });
        chat_msgs.push(ChatMessage {
            role: "user".into(),
            content: format!("[工具执行结果，继续你的任务]\n{}", tool_blocks.join("\n")),
        });
    }

    // Persist the assistant reply.
    if let Some(sid) = &session_id {
        if !final_text.is_empty() {
            let conn = db.conn.lock().map_err(|e| e.to_string())?;
            assistant_msg_id = chat_repo::add_message(&conn, sid, "assistant", &final_text, &json!({})).ok();
        }
    }

    stream::clear_cancel(&stream_id);

    let _ = app.emit("ai-chat-event", json!({
        "streamId": &stream_id,
        "event": { "type": "finish", "finalText": final_text }
    }));

    Ok(json!({
        "text": final_text,
        "userMessageId": user_msg_id,
        "assistantMessageId": assistant_msg_id,
    }))
}
