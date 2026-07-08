//! L2 global facts — stable cross-session knowledge (GenericAgent memory
//! hierarchy). A single bounded markdown file the agent maintains via the
//! updateGlobalFacts tool; its full content is injected into every system
//! prompt, so the cap keeps token cost predictable.

use std::fs;
use std::path::{Path, PathBuf};

const FACTS_FILE: &str = "global_facts.md";
const DIRECTIVES_FILE: &str = "assistant_directives.md";
const INTERVIEW_DIRECTIVES_FILE: &str = "interview_directives.md";
const MAX_FACTS_BYTES: usize = 8 * 1024;

/// Tauri-managed state holding the memory directory (app_data/memory).
pub struct MemoryDir(pub PathBuf);

pub fn read_global_facts(dir: &Path) -> String {
    fs::read_to_string(dir.join(FACTS_FILE)).unwrap_or_default()
}

pub fn update_global_facts(dir: &Path, content: &str) -> Result<String, String> {
    if content.len() > MAX_FACTS_BYTES {
        return Err(format!(
            "全局事实超过 {} KB 上限，请压缩合并后重写",
            MAX_FACTS_BYTES / 1024
        ));
    }
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    fs::write(dir.join(FACTS_FILE), content.trim()).map_err(|e| e.to_string())?;
    Ok("全局事实已更新".into())
}

/// Assistant tuning directives — written by the Global Agent, injected into
/// every per-resume assistant prompt. This is the Global Agent's "write
/// access" to the assistant's behavior (beyond advising the user).
pub fn read_assistant_directives(dir: &Path) -> String {
    fs::read_to_string(dir.join(DIRECTIVES_FILE)).unwrap_or_default()
}

pub fn update_assistant_directives(dir: &Path, content: &str) -> Result<String, String> {
    if content.len() > MAX_FACTS_BYTES {
        return Err(format!(
            "调优指令超过 {} KB 上限，请压缩后重写",
            MAX_FACTS_BYTES / 1024
        ));
    }
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    fs::write(dir.join(DIRECTIVES_FILE), content.trim()).map_err(|e| e.to_string())?;
    Ok("助手调优指令已更新，下一次对话即生效".into())
}

/// Interview-assistant tuning directives — mirrors assistant directives but for
/// the mock-interview helper. The Global Agent can read and rewrite these.
pub fn read_interview_directives(dir: &Path) -> String {
    fs::read_to_string(dir.join(INTERVIEW_DIRECTIVES_FILE)).unwrap_or_default()
}

pub fn update_interview_directives(dir: &Path, content: &str) -> Result<String, String> {
    if content.len() > MAX_FACTS_BYTES {
        return Err(format!(
            "面试调优指令超过 {} KB 上限，请压缩后重写",
            MAX_FACTS_BYTES / 1024
        ));
    }
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    fs::write(dir.join(INTERVIEW_DIRECTIVES_FILE), content.trim()).map_err(|e| e.to_string())?;
    Ok("面试助手调优指令已更新，下一次对话即生效".into())
}
