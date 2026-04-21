use serde_json::Value;
use tauri::State;

use crate::db::AppDb;
use crate::db::repo::resume as repo;
use super::CommandError;

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
    sections: Option<Vec<SectionInput>>,
) -> Result<String, CommandError> {
    let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
    let tmpl = template.as_deref().unwrap_or("classic");
    let lang = language.as_deref().unwrap_or("zh");
    let config = theme_config.unwrap_or(Value::Object(Default::default()));
    let resume_id = repo::create(&conn, &user_id, &title, tmpl, lang, &config)?;

    if let Some(secs) = sections {
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
    id: String,
    user_id: String,
    title: String,
    template: String,
    theme_config: Value,
    sections: Option<Vec<SectionInput>>,
) -> Result<(), CommandError> {
    let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
    repo::update(&conn, &id, &user_id, &title, &template, &theme_config)?;

    // Sync sections if provided
    if let Some(incoming) = sections {
        let existing = repo::find_sections_by_resume_id(&conn, &id)?;
        let existing_ids: std::collections::HashSet<&str> = existing.iter().map(|s| s.id.as_str()).collect();
        let incoming_ids: std::collections::HashSet<&str> = incoming.iter().filter_map(|s| s.id.as_deref()).collect();

        // Delete removed sections
        for ex in &existing {
            if !incoming_ids.contains(ex.id.as_str()) {
                repo::delete_section(&conn, &ex.id)?;
            }
        }

        // Create or update sections
        for (i, sec) in incoming.iter().enumerate() {
            if let Some(sec_id) = &sec.id {
                if existing_ids.contains(sec_id.as_str()) {
                    repo::update_section(
                        &conn,
                        sec_id,
                        &sec.title,
                        sec.sort_order.unwrap_or(i as i32),
                        sec.visible.unwrap_or(true),
                        &sec.content.clone().unwrap_or(Value::Object(Default::default())),
                    )?;
                }
            } else {
                repo::create_section(
                    &conn,
                    &id,
                    &sec.section_type,
                    &sec.title,
                    sec.sort_order.unwrap_or(i as i32),
                    sec.visible.unwrap_or(true),
                    &sec.content.clone().unwrap_or(Value::Object(Default::default())),
                )?;
            }
        }
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
