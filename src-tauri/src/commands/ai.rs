use std::collections::{HashMap, HashSet};
use std::io::Cursor;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::{engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD}, Engine};
use hmac::{Hmac, Mac};
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::RwLock;
use tracing::info;
use uuid::Uuid;
use sha2::Sha256;

use crate::ai::error::AIError;
use crate::ai::providers::build_default_providers;
use crate::ai::{
    GenerateRequest, ProviderRegistry, ProviderTaskHandle, ProviderTaskPollResult,
    ProviderTaskSubmission,
};

static REGISTRY: std::sync::OnceLock<ProviderRegistry> = std::sync::OnceLock::new();
static ACTIVE_NON_RESUMABLE_JOB_IDS: std::sync::OnceLock<Arc<RwLock<HashSet<String>>>> =
    std::sync::OnceLock::new();
static KLING_AUTH_MANAGER: std::sync::OnceLock<Arc<RwLock<Option<KlingAuthCache>>>> =
    std::sync::OnceLock::new();
static CANCELLED_VIDEO_TASK_IDS: std::sync::OnceLock<Arc<RwLock<HashSet<String>>>> =
    std::sync::OnceLock::new();
static VIDEO_BATCH_TASK_IDS: std::sync::OnceLock<Arc<RwLock<HashMap<String, Vec<String>>>>> =
    std::sync::OnceLock::new();

fn get_registry() -> &'static ProviderRegistry {
    REGISTRY.get_or_init(|| {
        let mut registry = ProviderRegistry::new();
        for provider in build_default_providers() {
            registry.register_provider(provider);
        }
        registry
    })
}

fn active_non_resumable_job_ids() -> &'static Arc<RwLock<HashSet<String>>> {
    ACTIVE_NON_RESUMABLE_JOB_IDS.get_or_init(|| Arc::new(RwLock::new(HashSet::new())))
}

fn kling_auth_manager() -> &'static Arc<RwLock<Option<KlingAuthCache>>> {
    KLING_AUTH_MANAGER.get_or_init(|| Arc::new(RwLock::new(None)))
}

fn cancelled_video_task_ids() -> &'static Arc<RwLock<HashSet<String>>> {
    CANCELLED_VIDEO_TASK_IDS.get_or_init(|| Arc::new(RwLock::new(HashSet::new())))
}

pub(crate) fn video_batch_task_ids() -> &'static Arc<RwLock<HashMap<String, Vec<String>>>> {
    VIDEO_BATCH_TASK_IDS.get_or_init(|| Arc::new(RwLock::new(HashMap::new())))
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GenerateRequestDto {
    pub prompt: String,
    pub model: String,
    pub size: String,
    pub aspect_ratio: String,
    pub reference_images: Option<Vec<String>>,
    pub extra_params: Option<HashMap<String, Value>>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitVideoBatchRequestDto {
    pub provider_id: String,
    pub node_id: String,
    pub batch_id: String,
    pub prompt: String,
    pub model_id: String,
    pub negative_prompt: Option<String>,
    pub duration: u16,
    pub aspect_ratio: String,
    pub output_count: u8,
    pub slot_refs: HashMap<String, String>,
    pub extra_params: serde_json::Value,
    pub access_key: String,
    pub secret_key: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelVideoBatchRequestDto {
    pub node_id: String,
    pub batch_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestKlingConnectionRequestDto {
    pub access_key: String,
    pub secret_key: String,
}

#[derive(Debug, Serialize)]
pub struct GenerationJobStatusDto {
    pub job_id: String,
    pub status: String,
    pub result: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitVideoBatchResponseDto {
    pub batch_id: String,
    pub sub_tasks: Vec<SubmitVideoBatchSubTaskDto>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitVideoBatchSubTaskDto {
    pub sub_task_id: String,
    pub variant_id: String,
    pub kling_task_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KlingApiEnvelope<T> {
    code: i64,
    message: String,
    request_id: Option<String>,
    data: Option<T>,
}

#[derive(Debug, Clone)]
struct KlingAuthCache {
    access_key: String,
    secret_key: String,
    token: String,
    expires_at: usize,
}

#[derive(Debug, Deserialize)]
pub(crate) struct KlingSubmitData {
    pub(crate) task_id: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct KlingSubmitResponse {
    pub(crate) code: i64,
    pub(crate) message: String,
    pub(crate) request_id: Option<String>,
    pub(crate) data: Option<KlingSubmitData>,
}

#[derive(Debug, Deserialize)]
struct KlingVideoItem {
    id: String,
    url: String,
    duration: String,
}

#[derive(Debug, Deserialize)]
struct KlingTaskResult {
    videos: Vec<KlingVideoItem>,
}

#[derive(Debug, Deserialize)]
struct KlingTaskData {
    task_id: String,
    task_status: String,
    task_status_msg: String,
    task_result: Option<KlingTaskResult>,
}

#[derive(Debug, Deserialize)]
struct KlingTaskQueryResponse {
    code: i64,
    message: String,
    request_id: Option<String>,
    data: Option<KlingTaskData>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VideoTaskProgressEventPayload {
    batch_id: String,
    sub_task_id: String,
    variant_id: Option<String>,
    task_id: String,
    node_id: String,
    status: String,
    progress: u8,
    video_ref: Option<String>,
    thumbnail_ref: Option<String>,
    video_duration_seconds: Option<f64>,
    kling_video_id: Option<String>,
    error: Option<String>,
    error_code: Option<i64>,
}

#[derive(Debug)]
struct GenerationJobRecord {
    job_id: String,
    provider_id: String,
    status: String,
    resumable: bool,
    external_task_id: Option<String>,
    external_task_meta_json: Option<String>,
    result: Option<String>,
    error: Option<String>,
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn now_secs() -> usize {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as usize
}

fn truncate_secret_for_log(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.len() <= 6 {
        return "***".to_string();
    }
    format!("{}***{}", &trimmed[..3], &trimmed[trimmed.len() - 2..])
}

fn build_kling_jwt(access_key: &str, secret_key: &str) -> Result<KlingAuthCache, String> {
    let now = now_secs();
    let expires_at = now + 1800;
    let header_json = r#"{"alg":"HS256","typ":"JWT"}"#.to_string();
    let claims_json = serde_json::json!({
        "iss": access_key,
        "exp": expires_at,
        "nbf": now.saturating_sub(5),
    })
    .to_string();
    let encoded_header = URL_SAFE_NO_PAD.encode(header_json.as_bytes());
    let encoded_claims = URL_SAFE_NO_PAD.encode(claims_json.as_bytes());
    let signing_input = format!("{}.{}", encoded_header, encoded_claims);

    let mut mac = Hmac::<Sha256>::new_from_slice(secret_key.as_bytes())
        .map_err(|error| format!("Failed to initialize Kling HMAC signer: {}", error))?;
    mac.update(signing_input.as_bytes());
    let signature = URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes());
    let token = format!("{}.{}", signing_input, signature);

    Ok(KlingAuthCache {
        access_key: access_key.to_string(),
        secret_key: secret_key.to_string(),
        token,
        expires_at,
    })
}

pub(crate) async fn get_kling_bearer_token(
    access_key: &str,
    secret_key: &str,
) -> Result<String, String> {
    let manager = kling_auth_manager();
    {
        let cached = manager.read().await;
        if let Some(cache) = cached.as_ref() {
            let refresh_threshold = now_secs() + 300;
            if cache.access_key == access_key
                && cache.secret_key == secret_key
                && cache.expires_at > refresh_threshold
            {
                return Ok(cache.token.clone());
            }
        }
    }

    let next_cache = build_kling_jwt(access_key, secret_key)?;
    let token = next_cache.token.clone();
    let mut cached = manager.write().await;
    *cached = Some(next_cache);
    Ok(token)
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

fn resolve_videos_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    let videos_dir = app_data_dir.join("videos");
    std::fs::create_dir_all(&videos_dir)
        .map_err(|e| format!("Failed to create videos dir: {}", e))?;
    Ok(videos_dir)
}

fn resolve_images_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    let images_dir = app_data_dir.join("images");
    std::fs::create_dir_all(&images_dir)
        .map_err(|e| format!("Failed to create images dir: {}", e))?;
    Ok(images_dir)
}

fn strip_data_url_prefix(value: &str) -> &str {
    if let Some((meta, payload)) = value.split_once(',') {
        if meta.starts_with("data:") && meta.ends_with(";base64") {
            return payload;
        }
    }
    value
}

pub(crate) fn decode_image_payload(value: &str) -> Result<Vec<u8>, String> {
    STANDARD
        .decode(strip_data_url_prefix(value))
        .map_err(|error| format!("Failed to decode image payload: {}", error))
}

fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::Digest;
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{:02x}", byte)).collect()
}

fn persist_video_bytes(app: &AppHandle, bytes: &[u8], extension: &str) -> Result<String, String> {
    let videos_dir = resolve_videos_dir(app)?;
    let filename = format!("{}.{}", sha256_hex(bytes), extension.trim_matches('.').to_ascii_lowercase());
    let output_path = videos_dir.join(filename);
    if !output_path.exists() {
        std::fs::write(&output_path, bytes)
            .map_err(|error| format!("Failed to persist video bytes: {}", error))?;
    }
    Ok(output_path.to_string_lossy().to_string())
}

fn persist_thumbnail_bytes(app: &AppHandle, bytes: &[u8]) -> Result<String, String> {
    let image = image::load_from_memory(bytes)
        .map_err(|error| format!("Failed to decode thumbnail bytes: {}", error))?;
    let mut buffer = Cursor::new(Vec::new());
    image
        .write_to(&mut buffer, image::ImageFormat::Jpeg)
        .map_err(|error| format!("Failed to encode thumbnail JPEG: {}", error))?;
    let images_dir = resolve_images_dir(app)?;
    let filename = format!("{}.jpg", sha256_hex(buffer.get_ref()));
    let output_path = images_dir.join(filename);
    if !output_path.exists() {
        std::fs::write(&output_path, buffer.get_ref())
            .map_err(|error| format!("Failed to persist thumbnail bytes: {}", error))?;
    }
    Ok(output_path.to_string_lossy().to_string())
}

fn map_video_status_to_progress(status: &str) -> u8 {
    match status {
        "submitted" => 10,
        "processing" => 50,
        "succeed" => 100,
        _ => 0,
    }
}

pub(crate) async fn emit_video_task_progress(
    app: &AppHandle,
    payload: &VideoTaskProgressEventPayload,
) -> Result<(), String> {
    app.emit("video-task-progress", payload.clone())
        .map_err(|error| format!("Failed to emit video-task-progress: {}", error))
}

pub(crate) fn video_task_progress_payload(
    batch_id: &str,
    sub_task_id: &str,
    variant_id: Option<&str>,
    task_id: &str,
    node_id: &str,
    status: &str,
    progress: u8,
) -> VideoTaskProgressEventPayload {
    VideoTaskProgressEventPayload {
        batch_id: batch_id.to_string(),
        sub_task_id: sub_task_id.to_string(),
        variant_id: variant_id.map(|value| value.to_string()),
        task_id: task_id.to_string(),
        node_id: node_id.to_string(),
        status: status.to_string(),
        progress,
        video_ref: None,
        thumbnail_ref: None,
        video_duration_seconds: None,
        kling_video_id: None,
        error: None,
        error_code: None,
    }
}

async fn is_video_task_cancelled(task_id: &str) -> bool {
    let cancelled = cancelled_video_task_ids().read().await;
    cancelled.contains(task_id)
}

fn ensure_generation_jobs_table(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS ai_generation_jobs (
          job_id TEXT PRIMARY KEY,
          provider_id TEXT NOT NULL,
          status TEXT NOT NULL,
          resumable INTEGER NOT NULL DEFAULT 0,
          external_task_id TEXT,
          external_task_meta_json TEXT,
          result TEXT,
          error TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_ai_generation_jobs_status ON ai_generation_jobs(status);
        CREATE INDEX IF NOT EXISTS idx_ai_generation_jobs_updated_at ON ai_generation_jobs(updated_at DESC);
        "#,
    )
    .map_err(|e| format!("Failed to initialize ai_generation_jobs table: {}", e))?;

    Ok(())
}

fn open_db(app: &AppHandle) -> Result<Connection, String> {
    let db_path = resolve_db_path(app)?;
    let conn = Connection::open(db_path).map_err(|e| format!("Failed to open SQLite DB: {}", e))?;

    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| format!("Failed to set journal_mode=WAL: {}", e))?;
    conn.pragma_update(None, "synchronous", "NORMAL")
        .map_err(|e| format!("Failed to set synchronous=NORMAL: {}", e))?;
    conn.pragma_update(None, "temp_store", "MEMORY")
        .map_err(|e| format!("Failed to set temp_store=MEMORY: {}", e))?;
    conn.busy_timeout(Duration::from_millis(3000))
        .map_err(|e| format!("Failed to set busy timeout: {}", e))?;

    ensure_generation_jobs_table(&conn)?;
    Ok(conn)
}

fn insert_generation_job(
    app: &AppHandle,
    job_id: &str,
    provider_id: &str,
    status: &str,
    resumable: bool,
    external_task_id: Option<&str>,
    external_task_meta_json: Option<&str>,
    result: Option<&str>,
    error: Option<&str>,
) -> Result<(), String> {
    let conn = open_db(app)?;
    let now = now_ms();
    conn.execute(
        r#"
        INSERT INTO ai_generation_jobs (
          job_id,
          provider_id,
          status,
          resumable,
          external_task_id,
          external_task_meta_json,
          result,
          error,
          created_at,
          updated_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
        "#,
        params![
            job_id,
            provider_id,
            status,
            if resumable { 1_i64 } else { 0_i64 },
            external_task_id,
            external_task_meta_json,
            result,
            error,
            now,
            now
        ],
    )
    .map_err(|e| format!("Failed to insert generation job: {}", e))?;
    Ok(())
}

fn update_generation_job(
    app: &AppHandle,
    job_id: &str,
    status: &str,
    result: Option<&str>,
    error: Option<&str>,
) -> Result<(), String> {
    let conn = open_db(app)?;
    conn.execute(
        r#"
        UPDATE ai_generation_jobs
        SET
          status = ?1,
          result = ?2,
          error = ?3,
          updated_at = ?4
        WHERE job_id = ?5
        "#,
        params![status, result, error, now_ms(), job_id],
    )
    .map_err(|e| format!("Failed to update generation job: {}", e))?;
    Ok(())
}

fn touch_generation_job(app: &AppHandle, job_id: &str) -> Result<(), String> {
    let conn = open_db(app)?;
    conn.execute(
        "UPDATE ai_generation_jobs SET updated_at = ?1 WHERE job_id = ?2",
        params![now_ms(), job_id],
    )
    .map_err(|e| format!("Failed to touch generation job: {}", e))?;
    Ok(())
}

fn get_generation_job(app: &AppHandle, job_id: &str) -> Result<Option<GenerationJobRecord>, String> {
    let conn = open_db(app)?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT
              job_id,
              provider_id,
              status,
              resumable,
              external_task_id,
              external_task_meta_json,
              result,
              error
            FROM ai_generation_jobs
            WHERE job_id = ?1
            LIMIT 1
            "#,
        )
        .map_err(|e| format!("Failed to prepare generation job query: {}", e))?;

    let result = stmt.query_row(params![job_id], |row| {
        Ok(GenerationJobRecord {
            job_id: row.get(0)?,
            provider_id: row.get(1)?,
            status: row.get(2)?,
            resumable: row.get::<_, i64>(3)? != 0,
            external_task_id: row.get(4)?,
            external_task_meta_json: row.get(5)?,
            result: row.get(6)?,
            error: row.get(7)?,
        })
    });

    match result {
        Ok(record) => Ok(Some(record)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(format!("Failed to load generation job: {}", error)),
    }
}

fn dto_from_record(record: &GenerationJobRecord) -> GenerationJobStatusDto {
    GenerationJobStatusDto {
        job_id: record.job_id.clone(),
        status: record.status.clone(),
        result: record.result.clone(),
        error: record.error.clone(),
    }
}

#[tauri::command]
pub async fn set_api_key(provider: String, api_key: String) -> Result<(), String> {
    info!("Setting API key for provider: {}", provider);

    let registry = get_registry();
    let resolved_provider = registry
        .get_provider(provider.as_str())
        .ok_or_else(|| format!("Unknown provider: {}", provider))?;

    resolved_provider
        .set_api_key(api_key)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn submit_generate_image_job(
    app: AppHandle,
    request: GenerateRequestDto,
) -> Result<String, String> {
    info!("Submitting generation job with model: {}", request.model);

    let registry = get_registry();
    let provider = registry
        .resolve_provider_for_model(&request.model)
        .or_else(|| registry.get_default_provider())
        .cloned()
        .ok_or_else(|| "Provider not found".to_string())?;

    let req = GenerateRequest {
        prompt: request.prompt,
        model: request.model,
        size: request.size,
        aspect_ratio: request.aspect_ratio,
        reference_images: request.reference_images,
        extra_params: request.extra_params,
    };

    let job_id = Uuid::new_v4().to_string();
    let provider_id = provider.name().to_string();

    if provider.supports_task_resume() {
        match provider.submit_task(req).await.map_err(|e| e.to_string())? {
            ProviderTaskSubmission::Succeeded(image_source) => {
                insert_generation_job(
                    &app,
                    job_id.as_str(),
                    provider_id.as_str(),
                    "succeeded",
                    true,
                    None,
                    None,
                    Some(image_source.as_str()),
                    None,
                )?;
            }
            ProviderTaskSubmission::Queued(handle) => {
                let meta_json = handle
                    .metadata
                    .as_ref()
                    .and_then(|value| serde_json::to_string(value).ok());
                insert_generation_job(
                    &app,
                    job_id.as_str(),
                    provider_id.as_str(),
                    "running",
                    true,
                    Some(handle.task_id.as_str()),
                    meta_json.as_deref(),
                    None,
                    None,
                )?;
            }
        }
        return Ok(job_id);
    }

    insert_generation_job(
        &app,
        job_id.as_str(),
        provider_id.as_str(),
        "running",
        false,
        None,
        None,
        None,
        None,
    )?;
    {
        let mut active_set = active_non_resumable_job_ids().write().await;
        active_set.insert(job_id.clone());
    }

    let app_handle = app.clone();
    let spawned_job_id = job_id.clone();
    let spawned_provider = provider.clone();
    tauri::async_runtime::spawn(async move {
        let result = spawned_provider.generate(req).await;
        let update_result = match result {
            Ok(image_source) => update_generation_job(
                &app_handle,
                spawned_job_id.as_str(),
                "succeeded",
                Some(image_source.as_str()),
                None,
            ),
            Err(error) => {
                let message = error.to_string();
                update_generation_job(
                    &app_handle,
                    spawned_job_id.as_str(),
                    "failed",
                    None,
                    Some(message.as_str()),
                )
            }
        };
        if let Err(error) = update_result {
            info!("Failed to update non-resumable generation job: {}", error);
        }
        let mut active_set = active_non_resumable_job_ids().write().await;
        active_set.remove(spawned_job_id.as_str());
    });

    Ok(job_id)
}

#[tauri::command]
pub async fn get_generate_image_job(
    app: AppHandle,
    job_id: String,
) -> Result<GenerationJobStatusDto, String> {
    let maybe_record = get_generation_job(&app, job_id.as_str())?;
    let Some(mut record) = maybe_record else {
        return Ok(GenerationJobStatusDto {
            job_id,
            status: "not_found".to_string(),
            result: None,
            error: Some("job not found".to_string()),
        });
    };

    if record.status == "succeeded" || record.status == "failed" {
        return Ok(dto_from_record(&record));
    }

    if !record.resumable {
        let is_active = {
            let active_set = active_non_resumable_job_ids().read().await;
            active_set.contains(record.job_id.as_str())
        };
        if is_active {
            let _ = touch_generation_job(&app, record.job_id.as_str());
            return Ok(dto_from_record(&record));
        }

        let interrupted_message = "job interrupted by app restart".to_string();
        update_generation_job(
            &app,
            record.job_id.as_str(),
            "failed",
            None,
            Some(interrupted_message.as_str()),
        )?;
        record.status = "failed".to_string();
        record.error = Some(interrupted_message);
        return Ok(dto_from_record(&record));
    }

    let provider = get_registry()
        .get_provider(record.provider_id.as_str())
        .cloned()
        .ok_or_else(|| format!("Provider not found for job: {}", record.provider_id))?;

    let Some(task_id) = record.external_task_id.clone() else {
        let message = "missing external task id".to_string();
        update_generation_job(
            &app,
            record.job_id.as_str(),
            "failed",
            None,
            Some(message.as_str()),
        )?;
        record.status = "failed".to_string();
        record.error = Some(message);
        return Ok(dto_from_record(&record));
    };

    let task_meta = record
        .external_task_meta_json
        .as_deref()
        .and_then(|raw| serde_json::from_str::<Value>(raw).ok());

    match provider
        .poll_task(ProviderTaskHandle {
            task_id,
            metadata: task_meta,
        })
        .await
    {
        Ok(ProviderTaskPollResult::Running) => {
            let _ = touch_generation_job(&app, record.job_id.as_str());
            Ok(dto_from_record(&record))
        }
        Ok(ProviderTaskPollResult::Succeeded(image_source)) => {
            update_generation_job(
                &app,
                record.job_id.as_str(),
                "succeeded",
                Some(image_source.as_str()),
                None,
            )?;
            Ok(GenerationJobStatusDto {
                job_id: record.job_id,
                status: "succeeded".to_string(),
                result: Some(image_source),
                error: None,
            })
        }
        Ok(ProviderTaskPollResult::Failed(message)) => {
            update_generation_job(
                &app,
                record.job_id.as_str(),
                "failed",
                None,
                Some(message.as_str()),
            )?;
            Ok(GenerationJobStatusDto {
                job_id: record.job_id,
                status: "failed".to_string(),
                result: None,
                error: Some(message),
            })
        }
        Err(AIError::TaskFailed(message)) => {
            update_generation_job(
                &app,
                record.job_id.as_str(),
                "failed",
                None,
                Some(message.as_str()),
            )?;
            Ok(GenerationJobStatusDto {
                job_id: record.job_id,
                status: "failed".to_string(),
                result: None,
                error: Some(message),
            })
        }
        Err(error) => Ok(GenerationJobStatusDto {
            job_id: record.job_id,
            status: "running".to_string(),
            result: None,
            error: Some(error.to_string()),
        }),
    }
}

#[tauri::command]
pub async fn generate_image(request: GenerateRequestDto) -> Result<String, String> {
    info!("Generating image with model: {}", request.model);

    let registry = get_registry();
    let provider = registry
        .resolve_provider_for_model(&request.model)
        .or_else(|| registry.get_default_provider())
        .ok_or_else(|| "Provider not found".to_string())?;

    let req = GenerateRequest {
        prompt: request.prompt,
        model: request.model,
        size: request.size,
        aspect_ratio: request.aspect_ratio,
        reference_images: request.reference_images,
        extra_params: request.extra_params,
    };

    provider.generate(req).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_models() -> Result<Vec<String>, String> {
    Ok(get_registry().list_models())
}

#[tauri::command]
pub async fn test_kling_connection(request: TestKlingConnectionRequestDto) -> Result<(), String> {
    let access_key = request.access_key.trim();
    let secret_key = request.secret_key.trim();
    if access_key.is_empty() || secret_key.is_empty() {
        return Err("Kling AccessKey and SecretKey are required".to_string());
    }

    info!(
        "Testing Kling connection with AccessKey {}",
        truncate_secret_for_log(access_key)
    );

    let token = get_kling_bearer_token(access_key, secret_key).await?;
    let client = reqwest::Client::new();
    let response = client
        .get("https://api-beijing.klingai.com/v1/videos/image2video?pageNum=1&pageSize=1")
        .header(CONTENT_TYPE, "application/json")
        .header(AUTHORIZATION, format!("Bearer {}", token))
        .send()
        .await
        .map_err(|error| format!("Failed to reach Kling API: {}", error))?;

    let status = response.status();
    let response_text = response
        .text()
        .await
        .map_err(|error| format!("Failed to read Kling response: {}", error))?;

    let envelope: KlingApiEnvelope<Value> = serde_json::from_str(&response_text)
        .map_err(|error| format!("Invalid Kling response payload: {}", error))?;

    if status.is_success() && envelope.code == 0 {
        return Ok(());
    }

    if status.as_u16() == 401 || envelope.code == 1000 || envelope.code == 1001 {
        return Err("AK/SK 无效，请检查 Kling 鉴权配置".to_string());
    }

    Err(format!(
        "Kling connection test failed: HTTP {} / code {} / {}",
        status.as_u16(),
        envelope.code,
        envelope.message
    ))
}

pub(crate) async fn poll_kling_video_task(
    app: AppHandle,
    batch_id: String,
    sub_task_id: String,
    variant_id: String,
    node_id: String,
    task_id: String,
    access_key: String,
    secret_key: String,
    first_frame_bytes: Vec<u8>,
) {
    let client = reqwest::Client::new();
    let mut interval_secs = 5_u64;
    let started_at = now_secs();

    loop {
        if is_video_task_cancelled(&task_id).await {
            let mut cancelled = cancelled_video_task_ids().write().await;
            cancelled.remove(&task_id);
            return;
        }

        if now_secs().saturating_sub(started_at) > 600 {
            let _ = emit_video_task_progress(
                &app,
                &VideoTaskProgressEventPayload {
                    error: Some("Video generation timed out after 10 minutes".to_string()),
                    ..video_task_progress_payload(
                        &batch_id,
                        &sub_task_id,
                        Some(&variant_id),
                        &task_id,
                        &node_id,
                        "failed",
                        0,
                    )
                },
            )
            .await;
            return;
        }

        tokio::time::sleep(Duration::from_secs(interval_secs)).await;

        if is_video_task_cancelled(&task_id).await {
            let mut cancelled = cancelled_video_task_ids().write().await;
            cancelled.remove(&task_id);
            return;
        }

        let token = match get_kling_bearer_token(&access_key, &secret_key).await {
            Ok(token) => token,
            Err(error) => {
                let _ = emit_video_task_progress(
                    &app,
                    &VideoTaskProgressEventPayload {
                        error: Some(error),
                        ..video_task_progress_payload(
                            &batch_id,
                            &sub_task_id,
                            Some(&variant_id),
                            &task_id,
                            &node_id,
                            "failed",
                            0,
                        )
                    },
                )
                .await;
                return;
            }
        };

        let response = match client
            .get(format!(
                "https://api-beijing.klingai.com/v1/videos/image2video/{}",
                task_id
            ))
            .header(CONTENT_TYPE, "application/json")
            .header(AUTHORIZATION, format!("Bearer {}", token))
            .send()
            .await
        {
            Ok(response) => response,
            Err(error) => {
                let _ = emit_video_task_progress(
                    &app,
                    &VideoTaskProgressEventPayload {
                        error: Some(format!("Failed to query Kling task: {}", error)),
                        ..video_task_progress_payload(
                            &batch_id,
                            &sub_task_id,
                            Some(&variant_id),
                            &task_id,
                            &node_id,
                            "failed",
                            0,
                        )
                    },
                )
                .await;
                return;
            }
        };

        let status_code = response.status();
        let body = match response.text().await {
            Ok(body) => body,
            Err(error) => {
                let _ = emit_video_task_progress(
                    &app,
                    &VideoTaskProgressEventPayload {
                        error: Some(format!("Failed to read Kling task response: {}", error)),
                        ..video_task_progress_payload(
                            &batch_id,
                            &sub_task_id,
                            Some(&variant_id),
                            &task_id,
                            &node_id,
                            "failed",
                            0,
                        )
                    },
                )
                .await;
                return;
            }
        };

        let task_response: KlingTaskQueryResponse = match serde_json::from_str(&body) {
            Ok(payload) => payload,
            Err(error) => {
                let _ = emit_video_task_progress(
                    &app,
                    &VideoTaskProgressEventPayload {
                        error: Some(format!("Invalid Kling task response: {}", error)),
                        ..video_task_progress_payload(
                            &batch_id,
                            &sub_task_id,
                            Some(&variant_id),
                            &task_id,
                            &node_id,
                            "failed",
                            0,
                        )
                    },
                )
                .await;
                return;
            }
        };

        if status_code.as_u16() == 429 || task_response.code == 1303 {
            interval_secs = ((interval_secs as f64) * 1.6).round().clamp(5.0, 30.0) as u64;
            continue;
        }

        if !status_code.is_success() || task_response.code != 0 {
            let _ = emit_video_task_progress(
                &app,
                &VideoTaskProgressEventPayload {
                    error: Some(format!(
                        "Kling query failed: HTTP {} / code {} / {}",
                        status_code.as_u16(),
                        task_response.code,
                        task_response.message
                    )),
                    error_code: Some(task_response.code),
                    ..video_task_progress_payload(
                        &batch_id,
                        &sub_task_id,
                        Some(&variant_id),
                        &task_id,
                        &node_id,
                        "failed",
                        0,
                    )
                },
            )
            .await;
            return;
        }

        let Some(task_data) = task_response.data else {
            let _ = emit_video_task_progress(
                &app,
                &VideoTaskProgressEventPayload {
                    error: Some("Kling task response missing data".to_string()),
                    ..video_task_progress_payload(
                        &batch_id,
                        &sub_task_id,
                        Some(&variant_id),
                        &task_id,
                        &node_id,
                        "failed",
                        0,
                    )
                },
            )
            .await;
            return;
        };

        match task_data.task_status.as_str() {
            "submitted" | "processing" => {
                let _ = emit_video_task_progress(
                    &app,
                    &video_task_progress_payload(
                        &batch_id,
                        &sub_task_id,
                        Some(&variant_id),
                        &task_id,
                        &node_id,
                        &task_data.task_status,
                        map_video_status_to_progress(&task_data.task_status),
                    ),
                )
                .await;
                interval_secs = ((interval_secs as f64) * 1.6).round().clamp(5.0, 30.0) as u64;
            }
            "failed" => {
                let _ = emit_video_task_progress(
                    &app,
                    &VideoTaskProgressEventPayload {
                        error: Some(task_data.task_status_msg),
                        ..video_task_progress_payload(
                            &batch_id,
                            &sub_task_id,
                            Some(&variant_id),
                            &task_id,
                            &node_id,
                            "failed",
                            0,
                        )
                    },
                )
                .await;
                return;
            }
            "succeed" => {
                let Some(video_item) = task_data
                    .task_result
                    .and_then(|result| result.videos.into_iter().next())
                else {
                    let _ = emit_video_task_progress(
                        &app,
                        &VideoTaskProgressEventPayload {
                            error: Some("Kling task succeeded but returned no video".to_string()),
                            ..video_task_progress_payload(
                                &batch_id,
                                &sub_task_id,
                                Some(&variant_id),
                                &task_id,
                                &node_id,
                                "failed",
                                0,
                            )
                        },
                    )
                    .await;
                    return;
                };

                let video_bytes = match client.get(&video_item.url).send().await {
                    Ok(response) => match response.bytes().await {
                        Ok(bytes) => bytes.to_vec(),
                        Err(error) => {
                            let _ = emit_video_task_progress(
                                &app,
                                &VideoTaskProgressEventPayload {
                                    error: Some(format!("Failed to read Kling video body: {}", error)),
                                    ..video_task_progress_payload(
                                        &batch_id,
                                        &sub_task_id,
                                        Some(&variant_id),
                                        &task_id,
                                        &node_id,
                                        "failed",
                                        0,
                                    )
                                },
                            )
                            .await;
                            return;
                        }
                    },
                    Err(error) => {
                        let _ = emit_video_task_progress(
                            &app,
                            &VideoTaskProgressEventPayload {
                                error: Some(format!("Failed to download Kling video: {}", error)),
                                ..video_task_progress_payload(
                                    &batch_id,
                                    &sub_task_id,
                                    Some(&variant_id),
                                    &task_id,
                                    &node_id,
                                    "failed",
                                    0,
                                )
                            },
                        )
                        .await;
                        return;
                    }
                };

                let video_path = match persist_video_bytes(&app, &video_bytes, "mp4") {
                    Ok(path) => path,
                    Err(error) => {
                        let _ = emit_video_task_progress(
                            &app,
                            &VideoTaskProgressEventPayload {
                                error: Some(error),
                                ..video_task_progress_payload(
                                    &batch_id,
                                    &sub_task_id,
                                    Some(&variant_id),
                                    &task_id,
                                    &node_id,
                                    "failed",
                                    0,
                                )
                            },
                        )
                        .await;
                        return;
                    }
                };

                // Fallback thumbnail: persist the submitted first frame until MP4 frame extraction is added.
                let thumbnail_path = match persist_thumbnail_bytes(&app, &first_frame_bytes) {
                    Ok(path) => path,
                    Err(error) => {
                        let _ = emit_video_task_progress(
                            &app,
                            &VideoTaskProgressEventPayload {
                                error: Some(error),
                                ..video_task_progress_payload(
                                    &batch_id,
                                    &sub_task_id,
                                    Some(&variant_id),
                                    &task_id,
                                    &node_id,
                                    "failed",
                                    0,
                                )
                            },
                        )
                        .await;
                        return;
                    }
                };

                let _ = emit_video_task_progress(
                    &app,
                    &VideoTaskProgressEventPayload {
                        video_ref: Some(video_path),
                        thumbnail_ref: Some(thumbnail_path),
                        video_duration_seconds: video_item.duration.parse::<f64>().ok(),
                        kling_video_id: Some(video_item.id),
                        ..video_task_progress_payload(
                            &batch_id,
                            &sub_task_id,
                            Some(&variant_id),
                            &task_id,
                            &node_id,
                            "succeed",
                            100,
                        )
                    },
                )
                .await;
                return;
            }
            _ => {
                let _ = emit_video_task_progress(
                    &app,
                    &VideoTaskProgressEventPayload {
                        error: Some(format!("Unknown Kling task status: {}", task_data.task_status)),
                        ..video_task_progress_payload(
                            &batch_id,
                            &sub_task_id,
                            Some(&variant_id),
                            &task_id,
                            &node_id,
                            "failed",
                            0,
                        )
                    },
                )
                .await;
                return;
            }
        }
    }
}

#[tauri::command]
pub async fn submit_video_batch(
    app: AppHandle,
    request: SubmitVideoBatchRequestDto,
) -> Result<SubmitVideoBatchResponseDto, String> {
    match request.provider_id.as_str() {
        "kling" => crate::providers::kling::submit_batch(&app, &request).await,
        id => Err(format!("Unknown video provider: {id}")),
    }
    /*
    if request.output_count == 0 || request.output_count > 4 {
        return Err("Video outputCount must be between 1 and 4".to_string());
    }

    if request.access_key.trim().is_empty() || request.secret_key.trim().is_empty() {
        return Err("Kling AccessKey and SecretKey are required".to_string());
    }

    let batch_id = request.batch_id.trim().to_string();
    let access_key = request.access_key.trim().to_string();
    let secret_key = request.secret_key.trim().to_string();
    let first_frame_bytes = decode_image_payload(&request.first_frame)?;
    if first_frame_bytes.len() > 2 * 1024 * 1024 {
        return Err("首帧图片超过 2MB，请先压缩后再提交 Kling".to_string());
    }

    let tail_frame_payload = if let Some(tail_frame) = request.tail_frame.as_deref() {
        let tail_bytes = decode_image_payload(tail_frame)?;
        if tail_bytes.len() > 2 * 1024 * 1024 {
            return Err("尾帧图片超过 2MB，请先压缩后再提交 Kling".to_string());
        }
        Some(STANDARD.encode(tail_bytes))
    } else {
        None
    };

    let client = reqwest::Client::new();
    let image_payload = STANDARD.encode(&first_frame_bytes);
    let mut sub_tasks = Vec::with_capacity(request.output_count as usize);
    let mut kling_task_ids = Vec::with_capacity(request.output_count as usize);
    for _ in 0..request.output_count {
        let token = get_kling_bearer_token(&access_key, &secret_key).await?;
        let sub_task_id = Uuid::new_v4().to_string();
        let variant_id = Uuid::new_v4().to_string();
        let submit_payload = serde_json::json!({
            "model_name": request.model_id,
            "image": image_payload,
            "image_tail": tail_frame_payload,
            "prompt": request.prompt.trim(),
            "negative_prompt": request.negative_prompt.as_deref().unwrap_or(""),
            "duration": request.duration.to_string(),
            "mode": request.mode,
            "aspect_ratio": request.aspect_ratio,
            "cfg_scale": request.cfg_scale,
            "callback_url": "",
            "external_task_id": "",
        });
        let response = client
            .post("https://api-beijing.klingai.com/v1/videos/image2video")
            .header(CONTENT_TYPE, "application/json")
            .header(AUTHORIZATION, format!("Bearer {}", token))
            .json(&submit_payload)
            .send()
            .await
            .map_err(|error| format!("Failed to submit Kling video task: {}", error))?;
        let status_code = response.status();
        let body = response
            .text()
            .await
            .map_err(|error| format!("Failed to read Kling submit response: {}", error))?;
        let submit_response: KlingSubmitResponse = serde_json::from_str(&body)
            .map_err(|error| format!("Invalid Kling submit response: {}", error))?;
        if status_code.as_u16() == 429 || submit_response.code == 1303 {
            return Err("Kling 骞跺彂宸叉弧锛岃绋嶅悗閲嶈瘯".to_string());
        }
        if status_code.as_u16() == 401 || submit_response.code == 1000 || submit_response.code == 1001 {
            return Err("閴存潈澶辫触锛岃妫€鏌?Kling AccessKey / SecretKey".to_string());
        }
        if !status_code.is_success() || submit_response.code != 0 {
            return Err(format!(
                "Kling submit failed: HTTP {} / code {} / {}",
                status_code.as_u16(),
                submit_response.code,
                submit_response.message
            ));
        }
        let task_id = submit_response
            .data
            .and_then(|data| if data.task_id.trim().is_empty() { None } else { Some(data.task_id) })
            .ok_or_else(|| "Kling submit response missing task_id".to_string())?;
        emit_video_task_progress(
            &app,
            &video_task_progress_payload(
                &batch_id,
                &sub_task_id,
                Some(&variant_id),
                &task_id,
                &request.node_id,
                "submitted",
                10,
            ),
        )
        .await?;
        kling_task_ids.push(task_id.clone());
        sub_tasks.push(SubmitVideoBatchSubTaskDto {
            sub_task_id: sub_task_id.clone(),
            variant_id: variant_id.clone(),
            kling_task_id: task_id.clone(),
        });
        let poll_app = app.clone();
        let poll_batch_id = batch_id.clone();
        let poll_sub_task_id = sub_task_id;
        let poll_variant_id = variant_id;
        let poll_node_id = request.node_id.clone();
        let poll_task_id = task_id;
        let poll_access_key = access_key.clone();
        let poll_secret_key = secret_key.clone();
        let poll_first_frame_bytes = first_frame_bytes.clone();
        tauri::async_runtime::spawn(async move {
            poll_kling_video_task(
                poll_app,
                poll_batch_id,
                poll_sub_task_id,
                poll_variant_id,
                poll_node_id,
                poll_task_id,
                poll_access_key,
                poll_secret_key,
                poll_first_frame_bytes,
            )
            .await;
        });
    }
    video_batch_task_ids()
        .write()
        .await
        .insert(batch_id.clone(), kling_task_ids);
    return Ok(SubmitVideoBatchResponseDto { batch_id, sub_tasks });
    let response = client
        .post("https://api-beijing.klingai.com/v1/videos/image2video")
        .header(CONTENT_TYPE, "application/json")
        .header(AUTHORIZATION, format!("Bearer {}", token))
        .json(&submit_payload)
        .send()
        .await
        .map_err(|error| format!("Failed to submit Kling video task: {}", error))?;
    let status_code = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| format!("Failed to read Kling submit response: {}", error))?;
    let submit_response: KlingSubmitResponse = serde_json::from_str(&body)
        .map_err(|error| format!("Invalid Kling submit response: {}", error))?;

    if status_code.as_u16() == 429 || submit_response.code == 1303 {
        return Err("Kling 并发已满，请稍后重试".to_string());
    }
    if status_code.as_u16() == 401 || submit_response.code == 1000 || submit_response.code == 1001 {
        return Err("鉴权失败，请检查 Kling AccessKey / SecretKey".to_string());
    }
    if !status_code.is_success() || submit_response.code != 0 {
        return Err(format!(
            "Kling submit failed: HTTP {} / code {} / {}",
            status_code.as_u16(),
            submit_response.code,
            submit_response.message
        ));
    }
    let task_id = submit_response
        .data
        .and_then(|data| {
            if data.task_id.trim().is_empty() {
                None
            } else {
                Some(data.task_id)
            }
        })
        .ok_or_else(|| "Kling submit response missing task_id".to_string())?;

    emit_video_task_progress(
        &app,
        &VideoTaskProgressEventPayload {
            task_id: task_id.clone(),
            node_id: request.node_id.clone(),
            status: "submitted".to_string(),
            progress: 10,
            video_ref: None,
            thumbnail_ref: None,
            video_duration_seconds: None,
            kling_video_id: None,
            error: None,
            error_code: None,
        },
    )
    .await?;

    let poll_app = app.clone();
    let poll_node_id = request.node_id.clone();
    let poll_task_id = task_id.clone();
    tauri::async_runtime::spawn(async move {
        poll_kling_video_task(
            poll_app,
            poll_node_id,
            poll_task_id,
            access_key,
            secret_key,
            first_frame_bytes,
        )
        .await;
    });

    Ok(SubmitVideoTaskResponseDto { task_id })
    */
}

#[tauri::command]
pub async fn cancel_video_batch(request: CancelVideoBatchRequestDto) -> Result<(), String> {
    if request.batch_id.trim().is_empty() {
        return Err("Video batch id is required".to_string());
    }
    let task_ids = video_batch_task_ids()
        .read()
        .await
        .get(request.batch_id.trim())
        .cloned()
        .unwrap_or_default();
    info!(
        "Cancelling local video wait for node {} batch {} with {} task(s)",
        request.node_id,
        request.batch_id,
        task_ids.len()
    );
    let mut cancelled = cancelled_video_task_ids().write().await;
    for task_id in task_ids {
        cancelled.insert(task_id);
    }
    Ok(())
}
