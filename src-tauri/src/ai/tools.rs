use rusqlite::Connection;
use serde_json::{json, Value};
use std::path::Path;

use super::provider::ToolSpec;
use super::skills;
use crate::db::repo::resume as resume_repo;

pub fn tool_specs(web_search_enabled: bool) -> Vec<ToolSpec> {
    let mut specs = vec![
        ToolSpec {
            name: "updateSection".into(),
            description: "Update a specific field in a resume section. Use field=\"items\" for list sections or field=\"categories\" for skills. For complex values pass JSON strings.".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "sectionId": { "type": "string", "description": "The ID of the section to update" },
                    "field": { "type": "string", "description": "The field within the section to update" },
                    "value": { "type": "string", "description": "The new value. For arrays/objects, pass JSON string." },
                },
                "required": ["sectionId", "field", "value"]
            }),
        },
        ToolSpec {
            name: "addSection".into(),
            description: "Add a new section to the resume.".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "type": { "type": "string", "description": "Section type (work_experience, education, skills, etc.)" },
                    "title": { "type": "string" },
                    "content": { "type": "string", "description": "Initial content as JSON string (optional)" },
                },
                "required": ["type", "title"]
            }),
        },
        ToolSpec {
            name: "removeSection".into(),
            description: "Remove a section from the resume by its ID.".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "sectionId": { "type": "string", "description": "The ID of the section to remove" },
                },
                "required": ["sectionId"]
            }),
        },
        ToolSpec {
            name: "rewriteText".into(),
            description: "Rewrite a text field to improve impact and clarity.".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "sectionId": { "type": "string" },
                    "field": { "type": "string" },
                    "improvedText": { "type": "string" },
                },
                "required": ["sectionId", "field", "improvedText"]
            }),
        },
        ToolSpec {
            name: "suggestSkills".into(),
            description: "Add suggested skills to the skills section.".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "skills": { "type": "array", "items": { "type": "string" } },
                    "category": { "type": "string" },
                },
                "required": ["skills", "category"]
            }),
        },
        ToolSpec {
            name: "analyzeJdMatch".into(),
            description: "Analyze how well the resume matches a job description. Returns match score, keyword analysis, and improvement suggestions.".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "jobDescription": { "type": "string", "description": "The full job description text to analyze against" },
                },
                "required": ["jobDescription"]
            }),
        },
        ToolSpec {
            name: "checkGrammar".into(),
            description: "Check the resume for grammar, spelling, and clarity issues. Returns a list of issues with suggestions.".into(),
            parameters: json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
        },
        ToolSpec {
            name: "updateCheckpoint".into(),
            description: "更新本会话的工作检查点（跨轮持续记忆）。用压缩格式记录：[任务] 目标 | [关键信息] 用户提供的定向信息（目标岗位/年限/投递方向）| [进度] 已完成/进行中 | [待办] 剩余步骤。开始系统性任务时创建，每完成一个阶段更新。内容替换式覆盖，保持在 500 字以内。".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "content": { "type": "string", "description": "新的检查点全文（覆盖旧值）" },
                },
                "required": ["content"]
            }),
        },
        ToolSpec {
            name: "listSkills".into(),
            description: "列出技能库（SOP 记忆）中所有可用技能及摘要。技能包含岗位画像（profile-*）和方法 SOP（sop-*）。".into(),
            parameters: json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
        },
        ToolSpec {
            name: "readSkill".into(),
            description: "读取一个技能的完整内容。做定向优化前必须先读取对应的岗位画像技能（如 profile-internet-tech）。".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "name": { "type": "string", "description": "技能名（listSkills 返回的名称，如 profile-finance）" },
                },
                "required": ["name"]
            }),
        },
        ToolSpec {
            name: "updateGlobalFacts".into(),
            description: "更新 L2 全局事实（跨会话稳定记忆，全文覆盖式）。记录：用户画像（目标岗位/行业/年限/投递方向）、长期偏好（文风、语言）、硬约束（不接受外包/期望城市）。与检查点的区别：临时任务进度进检查点，稳定事实进这里。保持压缩合并，2000 字内。".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "content": { "type": "string", "description": "全局事实完整 markdown 内容（覆盖旧值，须包含仍然有效的旧事实）" },
                },
                "required": ["content"]
            }),
        },
        ToolSpec {
            name: "archiveSession".into(),
            description: "L4 会话归档：一次任务收尾时，把本次会话的可复用结论提炼归档（做了什么、关键决策、结果、遗留待办）。跨会话长程回忆靠它。每个任务归档一次即可。".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "title": { "type": "string", "description": "归档标题，一句话（如：后端简历定制腾讯JD完成）" },
                    "summary": { "type": "string", "description": "提炼摘要，600 字内：任务/关键决策/结果/遗留" },
                },
                "required": ["title", "summary"]
            }),
        },
        ToolSpec {
            name: "readSessionArchive".into(),
            description: "读取一条 L4 会话归档的完整摘要（归档索引见系统提示词，传入其中的 id）。".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "archiveId": { "type": "string", "description": "归档 id（索引中方括号内的短 id）" },
                },
                "required": ["archiveId"]
            }),
        },
        ToolSpec {
            name: "listBrowserTabs".into(),
            description: "列出通过 Resumer 浏览器驱动（油猴脚本）连接的浏览器标签页（招聘网站）。无标签连接时提醒用户在设置→浏览器驱动中安装脚本并打开招聘网站。".into(),
            parameters: json!({ "type": "object", "properties": {}, "required": [] }),
        },
        ToolSpec {
            name: "browserEval".into(),
            description: "在已连接的浏览器标签页中执行 JavaScript 并返回结果。用于：读取 JD 页面文本（document.body.innerText）、提取岗位信息、向输入框填写内容。铁律：只读取和填写；任何不可逆动作（发送消息、提交投递、点击申请按钮）绝不代替用户执行，填写完成后提醒用户自行确认发送。脚本返回值须可 JSON 序列化，大文本先截取关键部分。".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "tabId": { "type": "string", "description": "目标标签页 ID（listBrowserTabs 获取；只有一个标签时可省略）" },
                    "script": { "type": "string", "description": "要执行的 JavaScript 表达式/IIFE" },
                },
                "required": ["script"]
            }),
        },
        ToolSpec {
            name: "saveSkill".into(),
            description: "把可复用的新方法/经验结晶为技能保存到技能库（markdown 格式）。当用户教授了新的优化偏好、行业知识，或你总结出可复用的方法时使用。名称只能含字母数字连字符下划线；同名会覆盖更新。".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "name": { "type": "string", "description": "技能名 slug，如 profile-biotech、sop-salary-negotiation" },
                    "content": { "type": "string", "description": "技能完整 markdown 内容：# 标题、> 一行摘要、正文" },
                },
                "required": ["name", "content"]
            }),
        },
    ];
    if web_search_enabled {
        specs.push(ToolSpec {
            name: "webSearch".into(),
            description: "联网搜索。用于查询实时信息：公司背景、行业动态、薪资行情、面试题库等。返回标题/链接/摘要列表；引用结果时注明来源。".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "query": { "type": "string", "description": "搜索关键词（中文或英文，具体明确）" },
                },
                "required": ["query"]
            }),
        });
    }
    specs
}

fn ensure_id(mut v: Value) -> Value {
    if let Value::Object(ref mut obj) = v {
        if !obj.contains_key("id") {
            obj.insert("id".into(), Value::String(uuid::Uuid::new_v4().to_string()));
        }
    }
    v
}

fn ensure_item_ids(value: Value) -> Value {
    match value {
        Value::Array(arr) => Value::Array(arr.into_iter().map(ensure_id).collect()),
        other => other,
    }
}

/// Parse AI-provided value. Accepts strings that may be JSON.
fn parse_value(raw: &Value) -> Value {
    if let Some(s) = raw.as_str() {
        if let Ok(parsed) = serde_json::from_str::<Value>(s) {
            return parsed;
        }
        return Value::String(s.to_string());
    }
    raw.clone()
}

pub fn exec_update_section(conn: &Connection, resume_id: &str, args: &Value) -> Result<Value, String> {
    let section_id = args.get("sectionId").and_then(|v| v.as_str()).ok_or("sectionId required")?;
    let field = args.get("field").and_then(|v| v.as_str()).ok_or("field required")?;
    let value = args.get("value").cloned().ok_or("value required")?;

    let resume = resume_repo::find_by_id_any(conn, resume_id)
        .map_err(|e| e.to_string())?
        .ok_or("Resume not found")?;

    let section = resume.sections.iter().find(|s| s.id == section_id)
        .ok_or("Section not found")?;

    let mut parsed_value = parse_value(&value);
    let item_sections = ["work_experience", "education", "projects", "certifications", "languages", "github", "custom"];
    let mut actual_field = field.to_string();

    if item_sections.contains(&section.section_type.as_str()) && field != "items" {
        if let Value::String(s) = &parsed_value {
            parsed_value = json!([{ "id": uuid::Uuid::new_v4().to_string(), "title": "", "description": s }]);
        } else if !parsed_value.is_array() {
            if let Some(items) = parsed_value.get("items").cloned() {
                parsed_value = items;
            }
        }
        actual_field = if section.section_type == "skills" { "categories".into() } else { "items".into() };
    }
    if section.section_type == "skills" && field != "categories" {
        actual_field = "categories".into();
    }

    if parsed_value.is_null() {
        return Err(format!("Invalid value: {} cannot be null", actual_field));
    }

    if parsed_value.is_array() {
        parsed_value = ensure_item_ids(parsed_value);
    }

    let mut updated_content = section.content.clone();
    if let Value::Object(ref mut obj) = updated_content {
        obj.insert(actual_field.clone(), parsed_value);
    } else {
        let mut obj = serde_json::Map::new();
        obj.insert(actual_field.clone(), parsed_value);
        updated_content = Value::Object(obj);
    }

    resume_repo::update_section(conn, &section.id, &section.title, section.sort_order, section.visible, &updated_content)
        .map_err(|e| e.to_string())?;

    Ok(json!({
        "success": true,
        "sectionType": section.section_type,
        "field": actual_field,
        "updatedContent": updated_content
    }))
}

pub fn exec_add_section(conn: &Connection, resume_id: &str, args: &Value) -> Result<Value, String> {
    let sec_type = args.get("type").and_then(|v| v.as_str()).ok_or("type required")?;
    let title = args.get("title").and_then(|v| v.as_str()).ok_or("title required")?;
    let content_str = args.get("content").and_then(|v| v.as_str());

    let existing = resume_repo::find_sections_by_resume_id(conn, resume_id).map_err(|e| e.to_string())?;
    let max_order = existing.iter().map(|s| s.sort_order).max().unwrap_or(-1);

    let parsed_content = if let Some(c) = content_str {
        serde_json::from_str::<Value>(c).unwrap_or_else(|_| default_content(sec_type))
    } else {
        default_content(sec_type)
    };

    let section_id = resume_repo::create_section(conn, resume_id, sec_type, title, max_order + 1, true, &parsed_content)
        .map_err(|e| e.to_string())?;

    Ok(json!({
        "success": true,
        "sectionType": sec_type,
        "sectionId": section_id
    }))
}

fn default_content(sec_type: &str) -> Value {
    match sec_type {
        "skills" => json!({ "categories": [] }),
        "summary" => json!({ "text": "" }),
        "personal_info" => json!({ "fullName": "", "jobTitle": "", "email": "", "phone": "", "location": "" }),
        _ => json!({ "items": [] }),
    }
}

pub fn exec_rewrite_text(conn: &Connection, resume_id: &str, args: &Value) -> Result<Value, String> {
    let section_id = args.get("sectionId").and_then(|v| v.as_str()).ok_or("sectionId required")?;
    let field = args.get("field").and_then(|v| v.as_str()).ok_or("field required")?;
    let improved = args.get("improvedText").and_then(|v| v.as_str()).ok_or("improvedText required")?;

    let resume = resume_repo::find_by_id_any(conn, resume_id)
        .map_err(|e| e.to_string())?
        .ok_or("Resume not found")?;

    let section = resume.sections.iter().find(|s| s.id == section_id)
        .ok_or("Section not found")?;

    let mut updated = section.content.clone();
    if let Value::Object(ref mut obj) = updated {
        obj.insert(field.to_string(), Value::String(improved.to_string()));
    }

    resume_repo::update_section(conn, &section.id, &section.title, section.sort_order, section.visible, &updated)
        .map_err(|e| e.to_string())?;

    Ok(json!({ "success": true, "sectionType": section.section_type, "field": field, "improvedText": improved }))
}

pub fn exec_suggest_skills(conn: &Connection, resume_id: &str, args: &Value) -> Result<Value, String> {
    let skills: Vec<String> = args.get("skills")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
        .ok_or("skills required")?;
    let category = args.get("category").and_then(|v| v.as_str()).ok_or("category required")?;

    let resume = resume_repo::find_by_id_any(conn, resume_id)
        .map_err(|e| e.to_string())?
        .ok_or("Resume not found")?;

    let skills_section = resume.sections.iter().find(|s| s.section_type == "skills")
        .ok_or("Skills section not found")?;

    let mut content = skills_section.content.clone();
    let categories = content.get_mut("categories").and_then(|v| v.as_array_mut()).cloned()
        .unwrap_or_default();

    let mut categories: Vec<Value> = categories;
    let existing_idx = categories.iter().position(|c|
        c.get("name").and_then(|v| v.as_str()) == Some(category)
    );

    if let Some(idx) = existing_idx {
        let mut existing_skills: Vec<String> = categories[idx].get("skills")
            .and_then(|v| v.as_array())
            .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
            .unwrap_or_default();
        for s in &skills {
            if !existing_skills.contains(s) {
                existing_skills.push(s.clone());
            }
        }
        categories[idx]["skills"] = json!(existing_skills);
    } else {
        categories.push(json!({
            "id": uuid::Uuid::new_v4().to_string(),
            "name": category,
            "skills": skills,
        }));
    }

    if let Value::Object(ref mut obj) = content {
        obj.insert("categories".into(), Value::Array(categories));
    }

    resume_repo::update_section(conn, &skills_section.id, &skills_section.title, skills_section.sort_order, skills_section.visible, &content)
        .map_err(|e| e.to_string())?;

    Ok(json!({ "success": true, "category": category, "skills": skills, "sectionId": skills_section.id }))
}

pub fn exec_remove_section(conn: &Connection, resume_id: &str, args: &Value) -> Result<Value, String> {
    let section_id = args.get("sectionId").and_then(|v| v.as_str()).ok_or("sectionId required")?;

    let resume = resume_repo::find_by_id_any(conn, resume_id)
        .map_err(|e| e.to_string())?
        .ok_or("Resume not found")?;

    // Verify the section exists
    let _section = resume.sections.iter().find(|s| s.id == section_id)
        .ok_or("Section not found")?;

    resume_repo::delete_section(conn, section_id)
        .map_err(|e| e.to_string())?;

    Ok(json!({ "success": true, "sectionId": section_id }))
}

pub fn execute_tool(
    conn: &Connection,
    resume_id: &str,
    skills_dir: &Path,
    name: &str,
    args: &Value,
) -> Value {
    let result = match name {
        "updateSection" => exec_update_section(conn, resume_id, args),
        "addSection" => exec_add_section(conn, resume_id, args),
        "removeSection" => exec_remove_section(conn, resume_id, args),
        "rewriteText" => exec_rewrite_text(conn, resume_id, args),
        "suggestSkills" => exec_suggest_skills(conn, resume_id, args),
        "listSkills" => Ok(json!({
            "skills": skills::skill_index(skills_dir)
                .into_iter()
                .map(|(name, summary)| json!({ "name": name, "summary": summary }))
                .collect::<Vec<_>>()
        })),
        "readSkill" => {
            let skill_name = args.get("name").and_then(|v| v.as_str()).unwrap_or("");
            skills::read_skill(skills_dir, skill_name)
                .map(|content| json!({ "name": skill_name, "content": content }))
        }
        "saveSkill" => {
            let skill_name = args.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let content = args.get("content").and_then(|v| v.as_str()).unwrap_or("");
            skills::save_skill(skills_dir, skill_name, content)
                .map(|msg| json!({ "success": true, "message": msg }))
        }
        // updateCheckpoint is intercepted by the chat loop (needs session_id);
        // reaching here means no session context exists.
        "updateCheckpoint" => Err("当前会话不支持检查点".into()),
        _ => Err(format!("Unknown tool: {}", name)),
    };
    match result {
        Ok(v) => v,
        Err(e) => json!({ "success": false, "error": e }),
    }
}
