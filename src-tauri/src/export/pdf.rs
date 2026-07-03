use std::path::PathBuf;
use std::process::Command;

/// Detect a Chromium-family executable able to run `--headless --print-to-pdf`.
/// Any Chromium fork works, so probe broadly (Chrome, Edge, Brave, Vivaldi,
/// Opera, Arc, Chromium) before giving up.
pub fn find_chrome() -> Option<PathBuf> {
    let candidates: Vec<PathBuf> = if cfg!(target_os = "windows") {
        vec![
            r"C:\Program Files\Google\Chrome\Application\chrome.exe".into(),
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe".into(),
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe".into(),
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe".into(),
            r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe".into(),
            r"C:\Program Files\Vivaldi\Application\vivaldi.exe".into(),
            r"C:\Program Files\Opera\opera.exe".into(),
            r"C:\Program Files\Chromium\Application\chrome.exe".into(),
        ]
    } else if cfg!(target_os = "macos") {
        vec![
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome".into(),
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge".into(),
            "/Applications/Chromium.app/Contents/MacOS/Chromium".into(),
            "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser".into(),
            "/Applications/Vivaldi.app/Contents/MacOS/Vivaldi".into(),
            "/Applications/Opera.app/Contents/MacOS/Opera".into(),
            "/Applications/Arc.app/Contents/MacOS/Arc".into(),
            "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary".into(),
        ]
    } else {
        vec![
            "/usr/bin/google-chrome".into(),
            "/usr/bin/google-chrome-stable".into(),
            "/usr/bin/chromium".into(),
            "/usr/bin/chromium-browser".into(),
            "/usr/bin/microsoft-edge".into(),
            "/usr/bin/brave-browser".into(),
            "/usr/bin/vivaldi".into(),
            "/usr/bin/opera".into(),
            "/snap/bin/chromium".into(),
        ]
    };

    for c in candidates {
        if c.exists() {
            return Some(c);
        }
    }

    // Fallback: try PATH
    for name in [
        "google-chrome",
        "chrome",
        "chromium",
        "chromium-browser",
        "microsoft-edge",
        "msedge",
        "brave-browser",
        "vivaldi",
        "opera",
    ] {
        if let Ok(path) = which::which(name) {
            return Some(path);
        }
    }
    None
}

pub fn generate_pdf_from_html(html: &str, output_path: &std::path::Path) -> Result<(), String> {
    // Stable CHROME_NOT_FOUND prefix lets the frontend detect this case and
    // show a localized, actionable message.
    let chrome = find_chrome().ok_or_else(|| {
        "CHROME_NOT_FOUND: no Chromium-family browser found for PDF rendering.".to_string()
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
