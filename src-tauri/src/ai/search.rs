//! Web search backends for the agent's webSearch tool.
//! - free  : DuckDuckGo HTML (no key, best-effort scrape)
//! - tavily: Tavily API (user-provided key)
//! "native" mode is handled in stream.rs by injecting the provider's own
//! search tool (Gemini googleSearch / Anthropic web_search) instead.

use serde_json::{json, Value};

use super::provider::AIConfig;

pub fn tool_enabled(cfg: &AIConfig) -> bool {
    cfg.web_search_mode == "free" || cfg.web_search_mode == "tavily"
}

pub async fn web_search(cfg: &AIConfig, query: &str) -> Result<Value, String> {
    let query = query.trim();
    if query.is_empty() {
        return Err("query 不能为空".into());
    }
    match cfg.web_search_mode.as_str() {
        "tavily" => tavily_search(&cfg.tavily_api_key, query).await,
        "free" => duckduckgo_search(query).await,
        _ => Err("联网搜索未开启（设置 → AI 配置 → 联网搜索）".into()),
    }
}

async fn tavily_search(api_key: &str, query: &str) -> Result<Value, String> {
    if api_key.trim().is_empty() {
        return Err("未配置 Tavily API Key".into());
    }
    let client = super::provider::http_client();
    let res = client
        .post("https://api.tavily.com/search")
        .json(&json!({
            "api_key": api_key,
            "query": query,
            "max_results": 5,
            "include_answer": true,
        }))
        .send()
        .await
        .map_err(|e| format!("Tavily 请求失败: {e}"))?;
    if !res.status().is_success() {
        let status = res.status();
        let txt = res.text().await.unwrap_or_default();
        return Err(format!("Tavily {status}: {}", txt.chars().take(200).collect::<String>()));
    }
    let data: Value = res.json().await.map_err(|e| e.to_string())?;
    let results: Vec<Value> = data
        .get("results")
        .and_then(|r| r.as_array())
        .map(|arr| {
            arr.iter()
                .take(5)
                .map(|r| {
                    json!({
                        "title": r.get("title").and_then(|v| v.as_str()).unwrap_or(""),
                        "url": r.get("url").and_then(|v| v.as_str()).unwrap_or(""),
                        "content": r.get("content").and_then(|v| v.as_str()).unwrap_or("")
                            .chars().take(500).collect::<String>(),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    Ok(json!({
        "engine": "tavily",
        "answer": data.get("answer").cloned().unwrap_or(Value::Null),
        "results": results,
    }))
}

async fn duckduckgo_search(query: &str) -> Result<Value, String> {
    let client = super::provider::http_client();
    let url = format!(
        "https://html.duckduckgo.com/html/?q={}",
        urlencoding::encode(query)
    );
    let res = client
        .get(&url)
        .header("Accept", "text/html")
        .send()
        .await
        .map_err(|e| format!("搜索请求失败: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("搜索引擎返回 {}", res.status()));
    }
    let html = res.text().await.map_err(|e| e.to_string())?;

    let link_re = regex::Regex::new(
        r#"(?s)<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>"#,
    )
    .map_err(|e| e.to_string())?;
    let snippet_re = regex::Regex::new(
        r#"(?s)<a[^>]*class="result__snippet"[^>]*>(.*?)</a>"#,
    )
    .map_err(|e| e.to_string())?;
    let tag_re = regex::Regex::new(r"<[^>]+>").map_err(|e| e.to_string())?;

    let snippets: Vec<String> = snippet_re
        .captures_iter(&html)
        .map(|c| tag_re.replace_all(&c[1], "").trim().to_string())
        .collect();

    let mut results = Vec::new();
    for (i, cap) in link_re.captures_iter(&html).enumerate() {
        if results.len() >= 5 {
            break;
        }
        let raw_href = &cap[1];
        // DDG wraps targets in a redirect: //duckduckgo.com/l/?uddg=<encoded>
        let url = raw_href
            .split("uddg=")
            .nth(1)
            .and_then(|part| {
                let enc = part.split('&').next().unwrap_or(part);
                urlencoding::decode(enc).ok().map(|c| c.into_owned())
            })
            .unwrap_or_else(|| raw_href.to_string());
        let title = tag_re.replace_all(&cap[2], "").trim().to_string();
        if title.is_empty() {
            continue;
        }
        results.push(json!({
            "title": title,
            "url": url,
            "content": snippets.get(i).cloned().unwrap_or_default().chars().take(400).collect::<String>(),
        }));
    }

    if results.is_empty() {
        return Err("免费搜索引擎未返回结果（可能被限流），可稍后重试或改用 Tavily".into());
    }
    Ok(json!({ "engine": "duckduckgo", "results": results }))
}
