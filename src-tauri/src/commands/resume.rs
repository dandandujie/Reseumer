use serde_json::Value;
use tauri::State;

use crate::db::AppDb;
use crate::db::repo::resume as repo;
use super::CommandError;

fn parse_sections_payload(sections: Option<Value>) -> Result<Option<Vec<SectionInput>>, CommandError> {
    let Some(value) = sections else {
        return Ok(None);
    };

    let items = value.as_array().ok_or_else(|| CommandError {
        message: "sections must be an array".into(),
    })?;

    let mut parsed = Vec::with_capacity(items.len());
    for item in items {
        parsed.push(parse_section_input(item)?);
    }

    Ok(Some(parsed))
}

fn parse_update_resume_payload(payload: Value) -> Result<(String, String, String, String, Value, Option<Vec<SectionInput>>), CommandError> {
    let obj = payload.as_object().ok_or_else(|| CommandError {
        message: "update_resume payload must be an object".into(),
    })?;

    let id = obj
        .get("id")
        .and_then(|v| v.as_str())
        .filter(|v| !v.trim().is_empty())
        .ok_or_else(|| CommandError {
            message: "update_resume payload.id is required".into(),
        })?
        .to_string();

    let user_id = obj
        .get("userId")
        .or_else(|| obj.get("user_id"))
        .and_then(|v| v.as_str())
        .filter(|v| !v.trim().is_empty())
        .ok_or_else(|| CommandError {
            message: "update_resume payload.userId is required".into(),
        })?
        .to_string();

    let title = obj
        .get("title")
        .and_then(|v| v.as_str())
        .filter(|v| !v.trim().is_empty())
        .ok_or_else(|| CommandError {
            message: "update_resume payload.title is required".into(),
        })?
        .to_string();

    let template = obj
        .get("template")
        .and_then(|v| v.as_str())
        .filter(|v| !v.trim().is_empty())
        .unwrap_or("classic")
        .to_string();

    let theme_config = obj
        .get("themeConfig")
        .or_else(|| obj.get("theme_config"))
        .cloned()
        .unwrap_or_else(|| Value::Object(Default::default()));

    let sections = parse_sections_payload(obj.get("sections").cloned())?;

    Ok((id, user_id, title, template, theme_config, sections))
}

fn parse_section_input(value: &Value) -> Result<SectionInput, CommandError> {
    let obj = value.as_object().ok_or_else(|| CommandError {
        message: "section item must be an object".into(),
    })?;

    let section_type = obj
        .get("type")
        .or_else(|| obj.get("sectionType"))
        .and_then(|v| v.as_str())
        .filter(|v| !v.trim().is_empty())
        .ok_or_else(|| CommandError {
            message: "section.type is required".into(),
        })?
        .to_string();

    let title = obj
        .get("title")
        .and_then(|v| v.as_str())
        .filter(|v| !v.trim().is_empty())
        .ok_or_else(|| CommandError {
            message: "section.title is required".into(),
        })?
        .to_string();

    let sort_order = obj
        .get("sortOrder")
        .or_else(|| obj.get("sort_order"))
        .and_then(|v| v.as_i64())
        .map(|v| v as i32);

    let visible = obj.get("visible").and_then(|v| v.as_bool());
    let content = obj.get("content").cloned();
    let id = obj
        .get("id")
        .and_then(|v| v.as_str())
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty());

    Ok(SectionInput {
        id,
        section_type,
        title,
        sort_order,
        visible,
        content,
    })
}

fn sync_sections(
    conn: &rusqlite::Connection,
    resume_id: &str,
    incoming: &[SectionInput],
) -> Result<(), rusqlite::Error> {
    let existing = repo::find_sections_by_resume_id(conn, resume_id)?;
    let existing_ids: std::collections::HashSet<&str> = existing.iter().map(|s| s.id.as_str()).collect();
    let incoming_ids: std::collections::HashSet<&str> = incoming
        .iter()
        .filter_map(|s| s.id.as_deref())
        .filter(|id| !id.trim().is_empty())
        .collect();

    // 删除已经不存在的区块，保持前后端状态一致。
    for ex in &existing {
        if !incoming_ids.contains(ex.id.as_str()) {
            repo::delete_section(conn, &ex.id)?;
        }
    }

    for (i, sec) in incoming.iter().enumerate() {
        let sort_order = sec.sort_order.unwrap_or(i as i32);
        let visible = sec.visible.unwrap_or(true);
        let content = sec.content.clone().unwrap_or(Value::Object(Default::default()));

        match sec.id.as_deref().filter(|id| !id.trim().is_empty()) {
            Some(sec_id) if existing_ids.contains(sec_id) => {
                repo::update_section(conn, sec_id, &sec.title, sort_order, visible, &content)?;
            }
            Some(sec_id) => {
                repo::create_section_with_id(
                    conn,
                    sec_id,
                    resume_id,
                    &sec.section_type,
                    &sec.title,
                    sort_order,
                    visible,
                    &content,
                )?;
            }
            None => {
                repo::create_section(
                    conn,
                    resume_id,
                    &sec.section_type,
                    &sec.title,
                    sort_order,
                    visible,
                    &content,
                )?;
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub fn list_resumes(db: State<AppDb>, user_id: String) -> Result<Vec<repo::Resume>, CommandError> {
    let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
    repo::find_all_by_user_id(&conn, &user_id).map_err(Into::into)
}

#[tauri::command]
pub fn get_resume(db: State<AppDb>, id: String, user_id: String) -> Result<Option<repo::ResumeWithSections>, CommandError> {
    let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
    repo::find_by_id(&conn, &id, &user_id).map_err(Into::into)
}

#[tauri::command]
pub fn create_resume(
    db: State<AppDb>,
    user_id: String,
    title: String,
    template: Option<String>,
    language: Option<String>,
    theme_config: Option<Value>,
    sections: Option<Value>,
) -> Result<String, CommandError> {
    let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
    let tmpl = template.as_deref().unwrap_or("classic");
    let lang = language.as_deref().unwrap_or("zh");
    let config = theme_config.unwrap_or(Value::Object(Default::default()));
    let resume_id = repo::create(&conn, &user_id, &title, tmpl, lang, &config)?;

    if let Some(secs) = parse_sections_payload(sections)? {
        for (i, sec) in secs.iter().enumerate() {
            repo::create_section(
                &conn,
                &resume_id,
                &sec.section_type,
                &sec.title,
                sec.sort_order.unwrap_or(i as i32),
                sec.visible.unwrap_or(true),
                &sec.content.clone().unwrap_or(Value::Object(Default::default())),
            )?;
        }
    }

    Ok(resume_id)
}

#[tauri::command]
pub fn update_resume(
    db: State<AppDb>,
    payload: Value,
) -> Result<(), CommandError> {
    let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
    let (id, user_id, title, template, theme_config, sections) = parse_update_resume_payload(payload)?;
    repo::update(&conn, &id, &user_id, &title, &template, &theme_config)?;

    if let Some(incoming) = sections {
        sync_sections(&conn, &id, &incoming)?;
    }

    Ok(())
}

#[tauri::command]
pub fn delete_resume(db: State<AppDb>, id: String, user_id: String) -> Result<(), CommandError> {
    let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
    repo::delete(&conn, &id, &user_id).map_err(Into::into)
}

#[tauri::command]
pub fn duplicate_resume(db: State<AppDb>, id: String, user_id: String) -> Result<String, CommandError> {
    let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
    repo::duplicate(&conn, &id, &user_id).map_err(Into::into)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SectionInput {
    pub id: Option<String>,
    #[serde(rename = "type")]
    pub section_type: String,
    pub title: String,
    pub sort_order: Option<i32>,
    pub visible: Option<bool>,
    pub content: Option<Value>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::{Connection, params};
    use serde_json::json;

    fn setup_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        conn.execute_batch(include_str!("../../migrations/001_initial.sql")).unwrap();
        conn.execute(
            "INSERT INTO users (id, fingerprint, settings) VALUES (?1, ?2, ?3)",
            params!["user-1", "fingerprint-1", "{}"],
        ).unwrap();
        conn
    }

    #[test]
    fn sync_sections_creates_new_section_when_client_supplies_id() {
        let conn = setup_conn();
        let resume_id = repo::create(&conn, "user-1", "测试简历", "classic", "zh", &json!({})).unwrap();

        let incoming = vec![SectionInput {
            id: Some("section-from-client".into()),
            section_type: "summary".into(),
            title: "个人简介".into(),
            sort_order: Some(0),
            visible: Some(true),
            content: Some(json!({ "text": "hello world" })),
        }];

        sync_sections(&conn, &resume_id, &incoming).unwrap();

        let sections = repo::find_sections_by_resume_id(&conn, &resume_id).unwrap();
        assert_eq!(sections.len(), 1);
        assert_eq!(sections[0].id, "section-from-client");
        assert_eq!(sections[0].title, "个人简介");
        assert_eq!(sections[0].content, json!({ "text": "hello world" }));
    }

    #[test]
    fn parse_sections_payload_supports_camel_case_fields() {
        let parsed = parse_sections_payload(Some(json!([
            {
                "id": "client-section-1",
                "type": "personal_info",
                "title": "个人信息",
                "sortOrder": 0,
                "visible": true,
                "content": {
                    "fullName": "张三",
                    "jobTitle": "工程师"
                }
            }
        ])))
        .unwrap()
        .unwrap();

        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].id.as_deref(), Some("client-section-1"));
        assert_eq!(parsed[0].section_type, "personal_info");
        assert_eq!(parsed[0].sort_order, Some(0));
        assert_eq!(parsed[0].visible, Some(true));
        assert_eq!(parsed[0].content, Some(json!({
            "fullName": "张三",
            "jobTitle": "工程师"
        })));
    }

    #[test]
    fn parse_update_resume_payload_reads_nested_sections_from_single_payload() {
        let (id, user_id, title, template, theme_config, sections) = parse_update_resume_payload(json!({
            "id": "resume-1",
            "userId": "user-1",
            "title": "测试简历",
            "template": "classic",
            "themeConfig": { "primaryColor": "#111111" },
            "sections": [
                {
                    "id": "section-1",
                    "type": "summary",
                    "title": "个人简介",
                    "sortOrder": 0,
                    "visible": true,
                    "content": { "text": "hello" }
                }
            ]
        }))
        .unwrap();

        assert_eq!(id, "resume-1");
        assert_eq!(user_id, "user-1");
        assert_eq!(title, "测试简历");
        assert_eq!(template, "classic");
        assert_eq!(theme_config, json!({ "primaryColor": "#111111" }));
        assert_eq!(sections.unwrap()[0].section_type, "summary");
    }
}
