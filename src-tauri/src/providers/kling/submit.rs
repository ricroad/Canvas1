use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use tauri::AppHandle;
use uuid::Uuid;

use crate::commands::ai::{
    decode_image_payload, emit_video_task_progress, get_kling_bearer_token,
    poll_kling_video_task, video_batch_task_ids, video_task_progress_payload,
    KlingSubmitResponse, SubmitVideoBatchRequestDto, SubmitVideoBatchResponseDto,
    SubmitVideoBatchSubTaskDto,
};

pub async fn submit_batch(
    app: &AppHandle,
    request: &SubmitVideoBatchRequestDto,
) -> Result<SubmitVideoBatchResponseDto, String> {
    let first_frame = request
        .slot_refs
        .get("image-first-frame")
        .ok_or_else(|| "Video source image is required".to_string())?;
    let tail_frame = request.slot_refs.get("image-tail-frame");
    let mode = request.extra_params["mode"].as_str().unwrap_or("std");
    let cfg_scale = request.extra_params["cfgScale"].as_f64().unwrap_or(0.5) as f32;

    if first_frame.trim().is_empty() {
        return Err("Video source image is required".to_string());
    }
    if request.model_id.trim().is_empty() {
        return Err("Video model is required".to_string());
    }
    if request.batch_id.trim().is_empty() {
        return Err("Video batch id is required".to_string());
    }
    if request.output_count == 0 || request.output_count > 4 {
        return Err("Video outputCount must be between 1 and 4".to_string());
    }
    if request.access_key.trim().is_empty() || request.secret_key.trim().is_empty() {
        return Err("Kling AccessKey and SecretKey are required".to_string());
    }

    let batch_id = request.batch_id.trim().to_string();
    let access_key = request.access_key.trim().to_string();
    let secret_key = request.secret_key.trim().to_string();
    let first_frame_bytes = decode_image_payload(first_frame)?;
    if first_frame_bytes.len() > 2 * 1024 * 1024 {
        return Err("Kling first frame image must be 2MB or smaller".to_string());
    }

    let tail_frame_payload = if let Some(tail_frame) = tail_frame {
        let tail_bytes = decode_image_payload(tail_frame)?;
        if tail_bytes.len() > 2 * 1024 * 1024 {
            return Err("Kling tail frame image must be 2MB or smaller".to_string());
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
            "mode": mode,
            "aspect_ratio": request.aspect_ratio,
            "cfg_scale": cfg_scale,
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
            return Err("Kling concurrency limit reached, please retry later".to_string());
        }
        if status_code.as_u16() == 401
            || submit_response.code == 1000
            || submit_response.code == 1001
        {
            return Err("Invalid Kling AccessKey / SecretKey".to_string());
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
            app,
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
    Ok(SubmitVideoBatchResponseDto { batch_id, sub_tasks })
}
