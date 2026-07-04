use serde_json::{json, Value};
use tauri::State;

use crate::browser_driver::{BrowserDriver, DRIVER_PORT, USERSCRIPT};

#[tauri::command]
pub fn browser_driver_info(driver: State<'_, BrowserDriver>) -> Value {
    json!({
        "port": DRIVER_PORT,
        "tabs": driver.list_tabs(),
    })
}

#[tauri::command]
pub fn browser_driver_userscript() -> String {
    USERSCRIPT.to_string()
}
