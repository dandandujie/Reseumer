use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: String,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
    pub fingerprint: Option<String>,
    pub settings: Value,
    pub created_at: i64,
    pub updated_at: i64,
}

pub fn find_by_id(conn: &Connection, id: &str) -> Result<Option<User>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, name, avatar_url, fingerprint, settings, created_at, updated_at
         FROM users WHERE id = ?1",
    )?;
    match stmt.query_row(params![id], map_user) {
        Ok(user) => Ok(Some(user)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn find_by_fingerprint(conn: &Connection, fingerprint: &str) -> Result<Option<User>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, name, avatar_url, fingerprint, settings, created_at, updated_at
         FROM users WHERE fingerprint = ?1",
    )?;
    match stmt.query_row(params![fingerprint], map_user) {
        Ok(user) => Ok(Some(user)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn upsert_by_fingerprint(conn: &Connection, fingerprint: &str) -> Result<User, rusqlite::Error> {
    if let Some(user) = find_by_fingerprint(conn, fingerprint)? {
        return Ok(user);
    }
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO users (id, fingerprint, name) VALUES (?1, ?2, 'User')",
        params![id, fingerprint],
    )?;
    find_by_id(conn, &id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)
}

pub fn update(conn: &Connection, id: &str, name: Option<&str>, avatar_url: Option<&str>) -> Result<(), rusqlite::Error> {
    if let Some(n) = name {
        conn.execute(
            "UPDATE users SET name = ?1, updated_at = unixepoch() WHERE id = ?2",
            params![n, id],
        )?;
    }
    if let Some(url) = avatar_url {
        conn.execute(
            "UPDATE users SET avatar_url = ?1, updated_at = unixepoch() WHERE id = ?2",
            params![url, id],
        )?;
    }
    Ok(())
}

pub fn get_settings(conn: &Connection, id: &str) -> Result<Value, rusqlite::Error> {
    let settings_str: String = conn.query_row(
        "SELECT settings FROM users WHERE id = ?1",
        params![id],
        |row| row.get(0),
    )?;
    Ok(serde_json::from_str(&settings_str).unwrap_or_default())
}

pub fn update_settings(conn: &Connection, id: &str, settings: &Value) -> Result<(), rusqlite::Error> {
    let existing = get_settings(conn, id)?;
    let merged = merge_json(existing, settings.clone());
    conn.execute(
        "UPDATE users SET settings = ?1, updated_at = unixepoch() WHERE id = ?2",
        params![serde_json::to_string(&merged).unwrap_or_default(), id],
    )?;
    Ok(())
}

fn map_user(row: &rusqlite::Row) -> Result<User, rusqlite::Error> {
    Ok(User {
        id: row.get(0)?,
        name: row.get(1)?,
        avatar_url: row.get(2)?,
        fingerprint: row.get(3)?,
        settings: serde_json::from_str::<Value>(&row.get::<_, String>(4)?).unwrap_or_default(),
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

fn merge_json(mut base: Value, patch: Value) -> Value {
    if let (Value::Object(base_map), Value::Object(patch_map)) = (&mut base, patch) {
        for (key, value) in patch_map {
            base_map.insert(key, value);
        }
    }
    base
}
