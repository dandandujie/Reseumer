use std::path::PathBuf;
use std::process::Command;

/// Detect system Chrome/Edge executable path.
pub fn find_chrome() -> Option<PathBuf> {
    let candidates: Vec<PathBuf> = if cfg!(target_os = "windows") {
        vec![
            r"C:\Program Files\Google\Chrome\Application\chrome.exe".into(),
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe".into(),
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe".into(),
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe".into(),
        ]
    } else if cfg!(target_os = "macos") {
        vec![
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome".into(),
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge".into(),
            "/Applications/Chromium.app/Contents/MacOS/Chromium".into(),
        ]
    } else {
        vec![
            "/usr/bin/google-chrome".into(),
            "/usr/bin/google-chrome-stable".into(),
            "/usr/bin/chromium".into(),
            "/usr/bin/chromium-browser".into(),
            "/usr/bin/microsoft-edge".into(),
        ]
    };

    for c in candidates {
        if c.exists() {
            return Some(c);
        }
    }

    // Fallback: try PATH
    for name in ["google-chrome", "chrome", "chromium", "microsoft-edge", "msedge"] {
        if which::which(name).is_ok() {
            return which::which(name).ok();
        }
    }
    None
}

pub fn generate_pdf_from_html(html: &str, output_path: &std::path::Path) -> Result<(), String> {
    let chrome = find_chrome().ok_or_else(|| {
        "Chrome or Edge not found. Please install Google Chrome or Microsoft Edge to export PDFs.".to_string()
    })?;

    // Write HTML to a temp file
    let temp_dir = std::env::temp_dir();
    let html_path = temp_dir.join(format!("reseumer-{}.html", uuid::Uuid::new_v4()));
    std::fs::write(&html_path, html).map_err(|e| format!("Failed to write temp HTML: {}", e))?;

    let file_url = format!("file://{}", html_path.to_string_lossy().replace('\\', "/"));
    let pdf_arg = format!("--print-to-pdf={}", output_path.to_string_lossy());

    let output = Command::new(&chrome)
        .args([
            "--headless=new",
            "--disable-gpu",
            "--no-sandbox",
            "--hide-scrollbars",
            "--print-to-pdf-no-header",
            &pdf_arg,
            &file_url,
        ])
        .output()
        .map_err(|e| format!("Failed to launch Chrome: {}", e))?;

    let _ = std::fs::remove_file(&html_path);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Chrome export failed: {}", stderr));
    }

    if !output_path.exists() {
        return Err("PDF was not generated".into());
    }

    Ok(())
}
