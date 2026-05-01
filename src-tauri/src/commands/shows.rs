use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, Row};
use serde::Serialize;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct Show {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub cover_url: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct ShowList {
    pub items: Vec<Show>,
    pub page: i64,
    pub page_size: i64,
    pub total: i64,
}

fn resolve_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;

    std::fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create app data dir: {}", e))?;

    Ok(app_data_dir.join("projects.db"))
}

fn open_db(app: &AppHandle) -> Result<Connection, String> {
    let db_path = resolve_db_path(app)?;
    let conn = Connection::open(db_path).map_err(|e| format!("Failed to open SQLite DB: {}", e))?;

    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|e| format!("Failed to enable foreign_keys pragma: {}", e))?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| format!("Failed to set journal_mode=WAL: {}", e))?;
    conn.pragma_update(None, "synchronous", "NORMAL")
        .map_err(|e| format!("Failed to set synchronous=NORMAL: {}", e))?;
    conn.pragma_update(None, "temp_store", "MEMORY")
        .map_err(|e| format!("Failed to set temp_store=MEMORY: {}", e))?;
    conn.busy_timeout(Duration::from_millis(3000))
        .map_err(|e| format!("Failed to set busy timeout: {}", e))?;

    Ok(conn)
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn normalize_pagination(page: Option<i64>, page_size: Option<i64>) -> (i64, i64, i64) {
    let page = page.unwrap_or(1).max(1);
    let page_size = page_size.unwrap_or(20).max(1);
    let offset = (page - 1).saturating_mul(page_size);
    (page, page_size, offset)
}

fn row_to_show(row: &Row<'_>) -> rusqlite::Result<Show> {
    Ok(Show {
        id: row.get(0)?,
        title: row.get(1)?,
        description: row.get(2)?,
        cover_url: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

fn load_show(conn: &Connection, id: &str) -> Result<Show, String> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, title, description, cover_url, created_at, updated_at
            FROM shows
            WHERE id = ?1
            LIMIT 1
            "#,
        )
        .map_err(|e| format!("Failed to prepare get show query: {}", e))?;

    match stmt.query_row(params![id], row_to_show) {
        Ok(show) => Ok(show),
        Err(rusqlite::Error::QueryReturnedNoRows) => Err(format!("Show not found: {}", id)),
        Err(error) => Err(format!("Failed to load show: {}", error)),
    }
}

#[tauri::command]
pub fn list_shows(
    app: AppHandle,
    page: Option<i64>,
    page_size: Option<i64>,
) -> Result<ShowList, String> {
    let conn = open_db(&app)?;
    let (page, page_size, offset) = normalize_pagination(page, page_size);
    let total = conn
        .query_row("SELECT COUNT(*) FROM shows", [], |row| row.get::<_, i64>(0))
        .map_err(|e| format!("Failed to count shows: {}", e))?;

    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, title, description, cover_url, created_at, updated_at
            FROM shows
            ORDER BY updated_at DESC
            LIMIT ?1 OFFSET ?2
            "#,
        )
        .map_err(|e| format!("Failed to prepare list shows query: {}", e))?;

    let rows = stmt
        .query_map(params![page_size, offset], row_to_show)
        .map_err(|e| format!("Failed to query shows: {}", e))?;

    let mut items = Vec::new();
    for row in rows {
        items.push(row.map_err(|e| format!("Failed to decode show row: {}", e))?);
    }

    Ok(ShowList {
        items,
        page,
        page_size,
        total,
    })
}

#[tauri::command]
pub fn create_show(
    app: AppHandle,
    title: String,
    description: Option<String>,
) -> Result<Show, String> {
    let conn = open_db(&app)?;
    let id = Uuid::new_v4().to_string();
    let now = now_ms();

    conn.execute(
        r#"
        INSERT INTO shows (
          id,
          user_id,
          title,
          description,
          cover_url,
          created_at,
          updated_at
        )
        VALUES (?1, 'local', ?2, ?3, NULL, ?4, ?5)
        "#,
        params![id, title, description, now, now],
    )
    .map_err(|e| format!("Failed to create show: {}", e))?;

    load_show(&conn, &id)
}

#[tauri::command]
pub fn get_show(app: AppHandle, id: String) -> Result<Show, String> {
    let conn = open_db(&app)?;
    load_show(&conn, &id)
}

#[tauri::command]
pub fn update_show(
    app: AppHandle,
    id: String,
    title: String,
    description: Option<String>,
    cover_url: Option<String>,
) -> Result<Show, String> {
    let conn = open_db(&app)?;
    let updated_at = now_ms();

    conn.execute(
        r#"
        UPDATE shows
        SET title = ?1,
            description = ?2,
            cover_url = ?3,
            updated_at = ?4
        WHERE id = ?5
        "#,
        params![title, description, cover_url, updated_at, id],
    )
    .map_err(|e| format!("Failed to update show: {}", e))?;

    load_show(&conn, &id)
}

#[tauri::command]
pub fn delete_show(app: AppHandle, id: String) -> Result<(), String> {
    let conn = open_db(&app)?;
    conn.execute("DELETE FROM shows WHERE id = ?1", params![id])
        .map_err(|e| format!("Failed to delete show: {}", e))?;
    Ok(())
}
