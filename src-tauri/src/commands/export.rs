use serde_json::Value;
use std::path::PathBuf;
use tauri::State;
use tauri_plugin_dialog::DialogExt;

use crate::db::AppDb;
use crate::db::repo::resume as resume_repo;
use crate::export::{pdf, txt, docx, qrcode};
use super::CommandError;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfExportOptions {
    pub resume_id: String,
    pub html: String,
    pub filename: Option<String>,
}

async fn pick_save_path(app: &tauri::AppHandle, default_name: &str, extension: &str) -> Option<PathBuf> {
    use std::sync::mpsc;
    let (tx, rx) = mpsc::channel();
    app.dialog()
        .file()
        .set_file_name(default_name)
        .add_filter(extension.to_uppercase(), &[extension])
        .save_file(move |path| {
            let _ = tx.send(path.and_then(|p| p.as_path().map(|p| p.to_path_buf())));
        });
    rx.recv().unwrap_or(None)
}

#[tauri::command]
pub async fn export_pdf(
    app: tauri::AppHandle,
    options: PdfExportOptions,
) -> Result<Option<String>, CommandError> {
    let default_name = options.filename.clone().unwrap_or_else(|| format!("{}.pdf", options.resume_id));
    let path = pick_save_path(&app, &default_name, "pdf").await;
    let path = match path {
        Some(p) => p,
        None => return Ok(None),
    };

    pdf::generate_pdf_from_html(&options.html, &path)
        .map_err(|e| CommandError { message: e })?;

    Ok(Some(path.to_string_lossy().to_string()))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HtmlExportOptions {
    pub resume_id: String,
    pub html: String,
    pub filename: Option<String>,
}

#[tauri::command]
pub async fn export_html(
    app: tauri::AppHandle,
    options: HtmlExportOptions,
) -> Result<Option<String>, CommandError> {
    let default_name = options.filename.clone().unwrap_or_else(|| format!("{}.html", options.resume_id));
    let path = pick_save_path(&app, &default_name, "html").await;
    let path = match path {
        Some(p) => p,
        None => return Ok(None),
    };

    std::fs::write(&path, options.html).map_err(|e| CommandError { message: format!("Failed to write: {}", e) })?;
    Ok(Some(path.to_string_lossy().to_string()))
}

#[tauri::command]
pub async fn export_txt(
    app: tauri::AppHandle,
    db: State<'_, AppDb>,
    resume_id: String,
    filename: Option<String>,
) -> Result<Option<String>, CommandError> {
    let resume = {
        let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
        resume_repo::find_by_id_any(&conn, &resume_id)
            .map_err(|e| CommandError { message: e.to_string() })?
            .ok_or(CommandError { message: "Resume not found".into() })?
    };

    let sections_values: Vec<Value> = resume.sections.iter().map(|s| serde_json::to_value(s).unwrap_or_default()).collect();
    let text = txt::generate_plain_text(&sections_values);

    let default_name = filename.unwrap_or_else(|| format!("{}.txt", resume.resume.title));
    let path = pick_save_path(&app, &default_name, "txt").await;
    let path = match path {
        Some(p) => p,
        None => return Ok(None),
    };

    std::fs::write(&path, text).map_err(|e| CommandError { message: format!("Failed to write: {}", e) })?;
    Ok(Some(path.to_string_lossy().to_string()))
}

#[tauri::command]
pub async fn export_json(
    app: tauri::AppHandle,
    db: State<'_, AppDb>,
    resume_id: String,
    filename: Option<String>,
) -> Result<Option<String>, CommandError> {
    let resume = {
        let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
        resume_repo::find_by_id_any(&conn, &resume_id)
            .map_err(|e| CommandError { message: e.to_string() })?
            .ok_or(CommandError { message: "Resume not found".into() })?
    };

    let json = serde_json::to_string_pretty(&resume).map_err(|e| CommandError { message: e.to_string() })?;

    let default_name = filename.unwrap_or_else(|| format!("{}.json", resume.resume.title));
    let path = pick_save_path(&app, &default_name, "json").await;
    let path = match path {
        Some(p) => p,
        None => return Ok(None),
    };

    std::fs::write(&path, json).map_err(|e| CommandError { message: format!("Failed to write: {}", e) })?;
    Ok(Some(path.to_string_lossy().to_string()))
}

#[tauri::command]
pub async fn export_docx(
    app: tauri::AppHandle,
    db: State<'_, AppDb>,
    resume_id: String,
    filename: Option<String>,
) -> Result<Option<String>, CommandError> {
    let resume = {
        let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
        resume_repo::find_by_id_any(&conn, &resume_id)
            .map_err(|e| CommandError { message: e.to_string() })?
            .ok_or(CommandError { message: "Resume not found".into() })?
    };

    let sections_values: Vec<Value> = resume.sections.iter().map(|s| serde_json::to_value(s).unwrap_or_default()).collect();

    let default_name = filename.unwrap_or_else(|| format!("{}.docx", resume.resume.title));
    let path = pick_save_path(&app, &default_name, "docx").await;
    let path = match path {
        Some(p) => p,
        None => return Ok(None),
    };

    docx::generate_docx(&resume.resume.title, &sections_values, &path)
        .map_err(|e| CommandError { message: e })?;

    Ok(Some(path.to_string_lossy().to_string()))
}

#[tauri::command]
pub async fn generate_qrcode(content: String) -> Result<String, CommandError> {
    qrcode::generate_svg(&content).map_err(|e| CommandError { message: e })
}
