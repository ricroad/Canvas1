use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, Row};
use serde::Serialize;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct Episode {
    pub id: String,
    pub show_id: Option<String>,
    pub user_id: String,
    pub title: String,
    pub episode_number: Option<i64>,
    pub node_count: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct EpisodeList {
    pub items: Vec<Episode>,
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

fn row_to_episode(row: &Row<'_>) -> rusqlite::Result<Episode> {
    Ok(Episode {
        id: row.get(0)?,
        show_id: row.get(1)?,
        user_id: row.get(2)?,
        title: row.get(3)?,
        episode_number: row.get(4)?,
        node_count: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

fn load_episode(conn: &Connection, id: &str) -> Result<Episode, String> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT
              id,
              show_id,
              'local' AS user_id,
              name,
              episode_number,
              node_count,
              created_at,
              updated_at
            FROM projects
            WHERE id = ?1
            LIMIT 1
            "#,
        )
        .map_err(|e| format!("Failed to prepare get episode query: {}", e))?;

    match stmt.query_row(params![id], row_to_episode) {
        Ok(episode) => Ok(episode),
        Err(rusqlite::Error::QueryReturnedNoRows) => Err(format!("Episode not found: {}", id)),
        Err(error) => Err(format!("Failed to load episode: {}", error)),
    }
}

#[tauri::command]
pub fn list_episodes(
    app: AppHandle,
    show_id: String,
    page: Option<i64>,
    page_size: Option<i64>,
) -> Result<EpisodeList, String> {
    let conn = open_db(&app)?;
    let (page, page_size, offset) = normalize_pagination(page, page_size);
    let total = conn
        .query_row(
            "SELECT COUNT(*) FROM projects WHERE show_id = ?1",
            params![&show_id],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| format!("Failed to count episodes: {}", e))?;

    let mut stmt = conn
        .prepare(
            r#"
            SELECT
              id,
              show_id,
              'local' AS user_id,
              name,
              episode_number,
              node_count,
              created_at,
              updated_at
            FROM projects
            WHERE show_id = ?1
            ORDER BY episode_number IS NULL, episode_number ASC, updated_at DESC
            LIMIT ?2 OFFSET ?3
            "#,
        )
        .map_err(|e| format!("Failed to prepare list episodes query: {}", e))?;

    let rows = stmt
        .query_map(params![&show_id, page_size, offset], row_to_episode)
        .map_err(|e| format!("Failed to query episodes: {}", e))?;

    let mut items = Vec::new();
    for row in rows {
        items.push(row.map_err(|e| format!("Failed to decode episode row: {}", e))?);
    }

    Ok(EpisodeList {
        items,
        page,
        page_size,
        total,
    })
}

#[tauri::command]
pub fn create_episode(
    app: AppHandle,
    show_id: String,
    title: String,
    episode_number: Option<i64>,
) -> Result<Episode, String> {
    let conn = open_db(&app)?;
    let id = Uuid::new_v4().to_string();
    let now = now_ms();

    conn.execute(
        r#"
        INSERT INTO projects (
          id,
          name,
          created_at,
          updated_at,
          node_count,
          nodes_json,
          edges_json,
          viewport_json,
          history_json,
          show_id,
          episode_number
        )
        VALUES (?1, ?2, ?3, ?4, 0, '[]', '[]', '{"x":0,"y":0,"zoom":1}', '{"past":[],"future":[]}', ?5, ?6)
        "#,
        params![id, title, now, now, show_id, episode_number],
    )
    .map_err(|e| format!("Failed to create episode: {}", e))?;

    load_episode(&conn, &id)
}

#[tauri::command]
pub fn delete_episode(app: AppHandle, id: String) -> Result<(), String> {
    let conn = open_db(&app)?;
    conn.execute("DELETE FROM projects WHERE id = ?1", params![id])
        .map_err(|e| format!("Failed to delete episode: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn update_episode_meta(
    app: AppHandle,
    id: String,
    title: String,
    episode_number: Option<i64>,
) -> Result<Episode, String> {
    let conn = open_db(&app)?;
    let updated_at = now_ms();

    conn.execute(
        r#"
        UPDATE projects
        SET name = ?1,
            episode_number = ?2,
            updated_at = ?3
        WHERE id = ?4
        "#,
        params![title, episode_number, updated_at, id],
    )
    .map_err(|e| format!("Failed to update episode metadata: {}", e))?;

    load_episode(&conn, &id)
}
