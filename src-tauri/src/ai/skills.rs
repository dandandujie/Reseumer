//! SOP skill memory — GenericAgent-style crystallized knowledge, adapted for
//! Reseumer. Skills are plain markdown files under `app_data_dir/skills/`:
//! seeded with built-in job-market profiles/SOPs, readable by the editor AI on
//! demand (token-efficient: only the index lives in the system prompt), and
//! extendable at runtime via the saveSkill tool ("crystallize" new methods).

use std::fs;
use std::path::{Path, PathBuf};

/// Built-in seed skills, written on startup only when the file is absent so
/// user edits survive upgrades.
const SEED_SKILLS: &[(&str, &str)] = &[
    ("profile-internet-tech", include_str!("../../skills/profile-internet-tech.md")),
    ("profile-product-ops", include_str!("../../skills/profile-product-ops.md")),
    ("profile-finance", include_str!("../../skills/profile-finance.md")),
    ("profile-soe", include_str!("../../skills/profile-soe.md")),
    ("profile-foreign", include_str!("../../skills/profile-foreign.md")),
    ("profile-manufacturing", include_str!("../../skills/profile-manufacturing.md")),
    ("sop-resume-diagnosis", include_str!("../../skills/sop-resume-diagnosis.md")),
    ("sop-jd-tailoring", include_str!("../../skills/sop-jd-tailoring.md")),
    ("sop-application-form", include_str!("../../skills/sop-application-form.md")),
];

const MAX_SKILL_BYTES: usize = 64 * 1024;

/// Tauri-managed state holding the resolved skills directory.
pub struct SkillsDir(pub PathBuf);

pub fn ensure_seed_skills(dir: &Path) {
    if fs::create_dir_all(dir).is_err() {
        return;
    }
    for (name, content) in SEED_SKILLS {
        let path = dir.join(format!("{name}.md"));
        if !path.exists() {
            let _ = fs::write(&path, content);
        }
    }
}

/// Only slug-safe names — blocks path traversal from tool arguments.
fn sanitize_name(name: &str) -> Option<String> {
    let trimmed = name.trim().trim_end_matches(".md");
    if trimmed.is_empty() || trimmed.len() > 80 {
        return None;
    }
    if trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        Some(trimmed.to_string())
    } else {
        None
    }
}

/// Extract a one-line summary: the first `> ` blockquote line, else the first
/// non-empty non-heading line.
fn summary_of(content: &str) -> String {
    let mut fallback = "";
    for line in content.lines() {
        let l = line.trim();
        if l.is_empty() || l.starts_with('#') {
            continue;
        }
        if let Some(rest) = l.strip_prefix("> ") {
            return rest.chars().take(80).collect();
        }
        if fallback.is_empty() {
            fallback = l;
        }
    }
    fallback.chars().take(80).collect()
}

pub fn skill_index(dir: &Path) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let Ok(entries) = fs::read_dir(dir) else {
        return out;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        let content = fs::read_to_string(&path).unwrap_or_default();
        out.push((stem.to_string(), summary_of(&content)));
    }
    out.sort();
    out
}

/// Render the index as a compact block for the system prompt.
pub fn skill_index_block(dir: &Path) -> String {
    let index = skill_index(dir);
    if index.is_empty() {
        return String::new();
    }
    index
        .iter()
        .map(|(name, summary)| format!("  - {name}：{summary}"))
        .collect::<Vec<_>>()
        .join("\n")
}

pub fn read_skill(dir: &Path, name: &str) -> Result<String, String> {
    let safe = sanitize_name(name).ok_or_else(|| format!("非法技能名：{name}"))?;
    let path = dir.join(format!("{safe}.md"));
    fs::read_to_string(&path).map_err(|_| format!("技能不存在：{safe}（用 listSkills 查看可用技能）"))
}

pub fn save_skill(dir: &Path, name: &str, content: &str) -> Result<String, String> {
    let safe = sanitize_name(name).ok_or_else(|| {
        format!("非法技能名：{name}（只允许字母、数字、连字符、下划线）")
    })?;
    if content.trim().is_empty() {
        return Err("技能内容不能为空".into());
    }
    if content.len() > MAX_SKILL_BYTES {
        return Err(format!("技能内容超过 {} KB 上限", MAX_SKILL_BYTES / 1024));
    }
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{safe}.md"));
    let existed = path.exists();
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(if existed {
        format!("技能已更新：{safe}")
    } else {
        format!("技能已保存：{safe}")
    })
}
