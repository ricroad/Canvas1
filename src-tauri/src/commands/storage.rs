use std::path::{Component, Path, PathBuf};

use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize)]
pub struct StoragePutResult {
    pub storage_key: String,
}

fn resolve_assets_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;

    let assets_dir = app_data_dir.join("assets");
    std::fs::create_dir_all(&assets_dir)
        .map_err(|e| format!("Failed to create assets dir: {}", e))?;

    Ok(assets_dir)
}

fn validate_path_segment(label: &str, value: &str) -> Result<(), String> {
    if value.trim().is_empty()
        || value == "."
        || value == ".."
        || value.contains('/')
        || value.contains('\\')
    {
        return Err(format!("Invalid {}: {}", label, value));
    }

    Ok(())
}

fn file_extension(file_name: &str) -> Result<String, String> {
    let extension = Path::new(file_name)
        .extension()
        .and_then(|value| value.to_str())
        .ok_or_else(|| format!("File name must include an extension: {}", file_name))?;

    if extension.is_empty()
        || extension == "."
        || extension == ".."
        || !extension
            .chars()
            .all(|value| value.is_ascii_alphanumeric())
    {
        return Err(format!("Invalid file extension: {}", extension));
    }

    Ok(extension.to_ascii_lowercase())
}

fn decode_base64_bytes(bytes_base64: &str) -> Result<Vec<u8>, String> {
    let encoded = bytes_base64
        .split_once(',')
        .map(|(_, data)| data)
        .unwrap_or(bytes_base64);

    STANDARD
        .decode(encoded)
        .map_err(|e| format!("Failed to decode base64 bytes: {}", e))
}

fn relative_path_from_storage_key(storage_key: &str) -> Result<PathBuf, String> {
    let relative_key = storage_key
        .strip_prefix("shows/")
        .ok_or_else(|| format!("Invalid storage key: {}", storage_key))?;

    if relative_key.is_empty() {
        return Err("Invalid empty storage key".to_string());
    }

    let mut relative_path = PathBuf::new();
    for component in Path::new(relative_key).components() {
        match component {
            Component::Normal(segment) => relative_path.push(segment),
            _ => return Err(format!("Invalid storage key: {}", storage_key)),
        }
    }

    Ok(relative_path)
}

#[tauri::command]
pub fn storage_put_object(
    app: AppHandle,
    show_id: String,
    asset_id: String,
    file_name: String,
    bytes_base64: String,
) -> Result<StoragePutResult, String> {
    validate_path_segment("show_id", &show_id)?;
    validate_path_segment("asset_id", &asset_id)?;

    let extension = file_extension(&file_name)?;
    let bytes = decode_base64_bytes(&bytes_base64)?;
    let assets_dir = resolve_assets_dir(&app)?;
    let show_dir = assets_dir.join(&show_id);
    std::fs::create_dir_all(&show_dir)
        .map_err(|e| format!("Failed to create show assets dir: {}", e))?;

    let object_name = format!("{}.{}", asset_id, extension);
    let output_path = show_dir.join(&object_name);
    std::fs::write(&output_path, bytes)
        .map_err(|e| format!("Failed to write storage object: {}", e))?;

    Ok(StoragePutResult {
        storage_key: format!("shows/{}/{}", show_id, object_name),
    })
}

#[tauri::command]
pub fn storage_resolve_url(app: AppHandle, storage_key: String) -> Result<String, String> {
    let assets_dir = resolve_assets_dir(&app)?;
    let relative_path = relative_path_from_storage_key(&storage_key)?;

    Ok(assets_dir
        .join(relative_path)
        .to_string_lossy()
        .to_string())
}

#[tauri::command]
pub fn storage_delete_object(app: AppHandle, storage_key: String) -> Result<(), String> {
    let assets_dir = resolve_assets_dir(&app)?;
    let relative_path = relative_path_from_storage_key(&storage_key)?;
    let object_path = assets_dir.join(relative_path);

    match std::fs::remove_file(&object_path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Failed to delete storage object: {}", error)),
    }
}
