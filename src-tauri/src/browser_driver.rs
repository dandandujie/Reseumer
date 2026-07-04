//! Browser driver — GenericAgent TMWebDriver protocol, ported to Rust.
//!
//! A tiny WebSocket server on 127.0.0.1 that userscript-equipped browser tabs
//! (Tampermonkey) connect to. The agent gains two atomic capabilities:
//! list connected tabs, and evaluate JS inside a tab — enough to read JD
//! pages and fill forms in the user's REAL, logged-in browser. The userscript
//! only @match-es job sites, which naturally scopes the reach.
//!
//! Wire protocol (JSON text frames):
//!   tab → app : { "type": "hello", "url": "...", "title": "..." }
//!   app → tab : { "type": "eval", "id": "...", "script": "..." }
//!   tab → app : { "type": "result", "id": "...", "ok": true, "data": ... }

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use futures::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio::net::TcpListener;
use tokio::sync::{mpsc, oneshot};
use tokio_tungstenite::tungstenite::Message;

pub const DRIVER_PORT: u16 = 17872;
const EVAL_TIMEOUT_SECS: u64 = 20;
/// The userscript users install into Tampermonkey.
pub const USERSCRIPT: &str = include_str!("../driver/reseumer-driver.user.js");

struct Tab {
    url: String,
    title: String,
    tx: mpsc::UnboundedSender<String>,
}

#[derive(Default)]
struct DriverInner {
    tabs: Mutex<HashMap<String, Tab>>,
    pending: Mutex<HashMap<String, oneshot::Sender<Value>>>,
}

#[derive(Clone)]
pub struct BrowserDriver {
    inner: Arc<DriverInner>,
}

impl BrowserDriver {
    pub fn new() -> Self {
        Self { inner: Arc::new(DriverInner::default()) }
    }

    /// Bind the local WS server; silently no-ops if the port is taken
    /// (another app instance already serves it).
    pub fn start(&self) {
        let inner = self.inner.clone();
        tauri::async_runtime::spawn(async move {
            let listener = match TcpListener::bind(("127.0.0.1", DRIVER_PORT)).await {
                Ok(l) => l,
                Err(e) => {
                    log::warn!("browser driver: port {DRIVER_PORT} unavailable ({e}); driver disabled");
                    return;
                }
            };
            log::info!("browser driver listening on 127.0.0.1:{DRIVER_PORT}");
            loop {
                let Ok((stream, _)) = listener.accept().await else { continue };
                let inner = inner.clone();
                tauri::async_runtime::spawn(async move {
                    let Ok(ws) = tokio_tungstenite::accept_async(stream).await else { return };
                    let (mut sink, mut source) = ws.split();
                    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
                    let tab_id = uuid::Uuid::new_v4().to_string()[..8].to_string();

                    // Writer: app → tab
                    let writer = tauri::async_runtime::spawn(async move {
                        while let Some(text) = rx.recv().await {
                            if sink.send(Message::Text(text)).await.is_err() {
                                break;
                            }
                        }
                    });

                    // Reader: tab → app
                    while let Some(Ok(msg)) = source.next().await {
                        let Message::Text(text) = msg else { continue };
                        let Ok(v) = serde_json::from_str::<Value>(&text) else { continue };
                        match v.get("type").and_then(|t| t.as_str()) {
                            Some("hello") => {
                                let url = v.get("url").and_then(|x| x.as_str()).unwrap_or("").to_string();
                                let title = v.get("title").and_then(|x| x.as_str()).unwrap_or("").to_string();
                                let mut tabs = inner.tabs.lock().unwrap();
                                match tabs.get_mut(&tab_id) {
                                    Some(tab) => {
                                        tab.url = url;
                                        tab.title = title;
                                    }
                                    None => {
                                        log::info!("browser tab connected: {title}");
                                        tabs.insert(tab_id.clone(), Tab { url, title, tx: tx.clone() });
                                    }
                                }
                            }
                            Some("result") => {
                                let id = v.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string();
                                if let Some(waiter) = inner.pending.lock().unwrap().remove(&id) {
                                    let _ = waiter.send(v);
                                }
                            }
                            _ => {}
                        }
                    }

                    // Disconnected — clean up.
                    inner.tabs.lock().unwrap().remove(&tab_id);
                    writer.abort();
                });
            }
        });
    }

    pub fn list_tabs(&self) -> Vec<Value> {
        let tabs = self.inner.tabs.lock().unwrap();
        let mut out: Vec<Value> = tabs
            .iter()
            .map(|(id, tab)| json!({ "tabId": id, "url": tab.url, "title": tab.title }))
            .collect();
        out.sort_by_key(|v| v.get("tabId").and_then(|x| x.as_str()).unwrap_or("").to_string());
        out
    }

    pub async fn eval(&self, tab_id: &str, script: &str) -> Result<Value, String> {
        let (req_id, rx) = {
            let tabs = self.inner.tabs.lock().unwrap();
            let tab = match tab_id {
                // Convenience: empty tabId targets the only connected tab.
                "" if tabs.len() == 1 => tabs.values().next().unwrap(),
                _ => tabs.get(tab_id).ok_or_else(|| {
                    format!("标签页不存在或已断开：{tab_id}（用 listBrowserTabs 查看当前连接）")
                })?,
            };
            let req_id = uuid::Uuid::new_v4().to_string()[..8].to_string();
            let payload = json!({ "type": "eval", "id": req_id, "script": script }).to_string();
            let (otx, orx) = oneshot::channel();
            self.inner.pending.lock().unwrap().insert(req_id.clone(), otx);
            tab.tx.send(payload).map_err(|_| "标签页连接已断开".to_string())?;
            (req_id, orx)
        };

        match tokio::time::timeout(Duration::from_secs(EVAL_TIMEOUT_SECS), rx).await {
            Ok(Ok(v)) => {
                let ok = v.get("ok").and_then(|x| x.as_bool()).unwrap_or(false);
                let data = v.get("data").cloned().unwrap_or(Value::Null);
                if ok {
                    Ok(data)
                } else {
                    Err(format!("页面脚本执行失败：{data}"))
                }
            }
            Ok(Err(_)) => {
                self.inner.pending.lock().unwrap().remove(&req_id);
                Err("标签页连接中断".into())
            }
            Err(_) => {
                self.inner.pending.lock().unwrap().remove(&req_id);
                Err(format!("执行超时（{EVAL_TIMEOUT_SECS}s）"))
            }
        }
    }
}
