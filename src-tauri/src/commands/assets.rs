use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, Row};
use serde::Serialize;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct Asset {
    pub id: String,
    pub show_id: String,
    pub category: String,
    pub name: String,
    pub storage_key: String,
    pub mime_type: String,
    pub size_bytes: i64,
    pub thumbnail_key: Option<String>,
    pub metadata_json: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct AssetList {
    pub items: Vec<Asset>,
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

fn row_to_asset(row: &Row<'_>) -> rusqlite::Result<Asset> {
    Ok(Asset {
        id: row.get(0)?,
        show_id: row.get(1)?,
        category: row.get(2)?,
        name: row.get(3)?,
        storage_key: row.get(4)?,
        mime_type: row.get(5)?,
        size_bytes: row.get(6)?,
        thumbnail_key: row.get(7)?,
        metadata_json: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

fn load_asset(conn: &Connection, id: &str) -> Result<Asset, String> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT
              id,
              show_id,
              category,
              name,
              storage_key,
              mime_type,
              size_bytes,
              thumbnail_key,
              metadata_json,
              created_at,
              updated_at
            FROM assets
            WHERE id = ?1
            LIMIT 1
            "#,
        )
        .map_err(|e| format!("Failed to prepare get asset query: {}", e))?;

    match stmt.query_row(params![id], row_to_asset) {
        Ok(asset) => Ok(asset),
        Err(rusqlite::Error::QueryReturnedNoRows) => Err(format!("Asset not found: {}", id)),
        Err(error) => Err(format!("Failed to load asset: {}", error)),
    }
}

#[tauri::command]
pub fn list_assets(
    app: AppHandle,
    show_id: String,
    category: Option<String>,
    page: Option<i64>,
    page_size: Option<i64>,
) -> Result<AssetList, String> {
    let conn = open_db(&app)?;
    let (page, page_size, offset) = normalize_pagination(page, page_size);
    let category_filter = category.as_deref();
    let total = conn
        .query_row(
            r#"
            SELECT COUNT(*)
            FROM assets
            WHERE show_id = ?1
              AND (?2 IS NULL OR category = ?2)
            "#,
            params![&show_id, category_filter],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| format!("Failed to count assets: {}", e))?;

    let mut stmt = conn
        .prepare(
            r#"
            SELECT
              id,
              show_id,
              category,
              name,
              storage_key,
              mime_type,
              size_bytes,
              thumbnail_key,
              metadata_json,
              created_at,
              updated_at
            FROM assets
            WHERE show_id = ?1
              AND (?2 IS NULL OR category = ?2)
            ORDER BY updated_at DESC
            LIMIT ?3 OFFSET ?4
            "#,
        )
        .map_err(|e| format!("Failed to prepare list assets query: {}", e))?;

    let rows = stmt
        .query_map(params![&show_id, category_filter, page_size, offset], row_to_asset)
        .map_err(|e| format!("Failed to query assets: {}", e))?;

    let mut items = Vec::new();
    for row in rows {
        items.push(row.map_err(|e| format!("Failed to decode asset row: {}", e))?);
    }

    Ok(AssetList {
        items,
        page,
        page_size,
        total,
    })
}

#[tauri::command]
pub fn create_asset(
    app: AppHandle,
    show_id: String,
    category: String,
    name: String,
    storage_key: String,
    mime_type: String,
    size_bytes: i64,
    thumbnail_key: Option<String>,
    metadata_json: Option<String>,
) -> Result<Asset, String> {
    let conn = open_db(&app)?;
    let id = Uuid::new_v4().to_string();
    let now = now_ms();

    conn.execute(
        r#"
        INSERT INTO assets (
          id,
          show_id,
          user_id,
          category,
          name,
          storage_key,
          mime_type,
          size_bytes,
          thumbnail_key,
          metadata_json,
          created_at,
          updated_at
        )
        VALUES (?1, ?2, 'local', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
        "#,
        params![
            id,
            show_id,
            category,
            name,
            storage_key,
            mime_type,
            size_bytes,
            thumbnail_key,
            metadata_json,
            now,
            now,
        ],
    )
    .map_err(|e| format!("Failed to create asset: {}", e))?;

    load_asset(&conn, &id)
}

#[tauri::command]
pub fn update_asset(
    app: AppHandle,
    id: String,
    name: String,
    category: String,
) -> Result<Asset, String> {
    let conn = open_db(&app)?;
    let updated_at = now_ms();

    conn.execute(
        r#"
        UPDATE assets
        SET name = ?1,
            category = ?2,
            updated_at = ?3
        WHERE id = ?4
        "#,
        params![name, category, updated_at, id],
    )
    .map_err(|e| format!("Failed to update asset: {}", e))?;

    load_asset(&conn, &id)
}

#[tauri::command]
pub fn delete_asset(app: AppHandle, id: String) -> Result<(), String> {
    let conn = open_db(&app)?;
    conn.execute("DELETE FROM assets WHERE id = ?1", params![id])
        .map_err(|e| format!("Failed to delete asset: {}", e))?;
    Ok(())
}
