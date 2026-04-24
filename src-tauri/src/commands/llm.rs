use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::io::Read;
use tracing::info;

// ── OpenAI-compatible structs ─────────────────────────────────────────────────

#[derive(Debug, Serialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Debug, Serialize)]
struct ChatCompletionRequest {
    model: String,
    messages: Vec<ChatMessage>,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionChoice {
    message: ChatCompletionMessage,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionMessage {
    content: String,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<ChatCompletionChoice>,
}

// ── Gemini structs ────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct GeminiCandidate {
    content: GeminiContent,
}

#[derive(Debug, Deserialize)]
struct GeminiContent {
    parts: Vec<GeminiPart>,
}

#[derive(Debug, Deserialize)]
struct GeminiPart {
    text: String,
}

#[derive(Debug, Deserialize)]
struct GeminiResponse {
    candidates: Vec<GeminiCandidate>,
}

// ── System prompt ─────────────────────────────────────────────────────────────

const STORYBOARD_SYSTEM_PROMPT: &str = r#"你是一位专业的影视分镜导演。用户会提供剧本内容，你需要为每个镜头生成适合AI图像生成的详细提示词。

要求：
1. 每个镜头提示词必须包含：场景构图、人物位置与动作、光线氛围、镜头角度、情感基调
2. 提示词语言为中文，风格简洁专业，50-150字
3. 严格按照JSON格式返回，格式为字符串数组：["镜头1提示词", "镜头2提示词", ...]
4. 只返回JSON数组，不要有其他文字"#;

// ── Helper: extract JSON array from LLM response text ─────────────────────────

fn parse_prompts_from_content(content: &str) -> Result<Vec<String>, String> {
    let content = content.trim();
    let json_str = if let Some(start) = content.find('[') {
        let end = content.rfind(']').unwrap_or(content.len().saturating_sub(1));
        &content[start..=end]
    } else {
        content
    };

    let values: Vec<Value> = serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse prompts JSON: {}. Raw: {}", e, &content[..content.len().min(300)]))?;

    let result: Vec<String> = values
        .into_iter()
        .filter_map(|v| v.as_str().map(|s| s.to_string()))
        .collect();

    if result.is_empty() {
        return Err("LLM returned empty prompts array".to_string());
    }
    Ok(result)
}

// ── OpenAI-compatible call ────────────────────────────────────────────────────

async fn call_openai_compatible(
    client: &Client,
    base_url: &str,
    model: &str,
    api_key: &str,
    system_prompt: &str,
    user_message: &str,
) -> Result<String, String> {
    let url = format!("{}/v1/chat/completions", base_url.trim_end_matches('/'));
    let body = ChatCompletionRequest {
        model: model.to_string(),
        messages: vec![
            ChatMessage { role: "system".to_string(), content: system_prompt.to_string() },
            ChatMessage { role: "user".to_string(), content: user_message.to_string() },
        ],
    };

    let response = client
        .post(&url)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let err = response.text().await.unwrap_or_default();
        return Err(format!("API error {}: {}", status, err));
    }

    let resp: ChatCompletionResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    resp.choices
        .into_iter()
        .next()
        .map(|c| c.message.content)
        .ok_or_else(|| "API returned no choices".to_string())
}

// ── Gemini call ───────────────────────────────────────────────────────────────

async fn call_gemini(
    client: &Client,
    base_url: &str,
    model: &str,
    api_key: &str,
    system_prompt: &str,
    user_message: &str,
) -> Result<String, String> {
    let url = format!(
        "{}/v1beta/models/{}:generateContent?key={}",
        base_url.trim_end_matches('/'),
        model,
        api_key
    );

    let body = json!({
        "system_instruction": {
            "parts": [{ "text": system_prompt }]
        },
        "contents": [
            {
                "parts": [{ "text": user_message }]
            }
        ],
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 4096
        }
    });

    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let err = response.text().await.unwrap_or_default();
        return Err(format!("Gemini API error {}: {}", status, err));
    }

    let resp: GeminiResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Gemini response: {}", e))?;

    resp.candidates
        .into_iter()
        .next()
        .and_then(|c| c.content.parts.into_iter().next())
        .map(|p| p.text)
        .ok_or_else(|| "Gemini returned no candidates".to_string())
}

// ── Main command ──────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn generate_storyboard_prompts(
    script_text: String,
    episode: Option<String>,
    scene: Option<String>,
    shot_count: u32,
    style_hint: Option<String>,
    model: String,
    api_key: String,
    provider_base_url: String,
) -> Result<Vec<String>, String> {
    info!("Generating storyboard prompts: model={}, shot_count={}", model, shot_count);

    let episode_info = episode.as_deref().map(|e| format!("集数：{}\n", e)).unwrap_or_default();
    let scene_info = scene.as_deref().map(|s| format!("场次：{}\n", s)).unwrap_or_default();
    let style_info = style_hint.as_deref().map(|h| format!("风格要求：{}", h)).unwrap_or_default();

    let user_message = format!(
        "剧本内容：\n{}\n\n{}{}请生成{}个镜头的分镜提示词。\n{}",
        script_text, episode_info, scene_info, shot_count, style_info
    );

    let client = Client::new();
    let is_gemini = provider_base_url.contains("generativelanguage.googleapis.com");

    let content = if is_gemini {
        call_gemini(&client, &provider_base_url, &model, &api_key, STORYBOARD_SYSTEM_PROMPT, &user_message).await?
    } else {
        call_openai_compatible(&client, &provider_base_url, &model, &api_key, STORYBOARD_SYSTEM_PROMPT, &user_message).await?
    };

    let prompts = parse_prompts_from_content(&content)?;
    info!("Successfully generated {} prompts", prompts.len());
    Ok(prompts)
}

// ── General chat completion command ──────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct ChatMsg {
    pub role: String,
    pub content: String,
}

#[tauri::command]
pub async fn chat_completion(
    messages: Vec<ChatMsg>,
    model: String,
    api_key: String,
    provider_base_url: String,
    system_prompt: Option<String>,
) -> Result<String, String> {
    info!("Chat completion: model={}, messages={}", model, messages.len());

    let sys = system_prompt.unwrap_or_else(|| {
        "你是 Storyboard 智能助手，专注于影视分镜、剧本分析和创意工作。用简洁友好的方式回答用户的问题。".to_string()
    });

    let client = Client::new();
    let is_gemini = provider_base_url.contains("generativelanguage.googleapis.com");

    if is_gemini {
        // Gemini: multi-turn conversation
        let url = format!(
            "{}/v1beta/models/{}:generateContent?key={}",
            provider_base_url.trim_end_matches('/'),
            model,
            api_key
        );

        let mut contents: Vec<Value> = Vec::new();
        for msg in &messages {
            let gemini_role = match msg.role.as_str() {
                "assistant" => "model",
                _ => "user",
            };
            contents.push(json!({
                "role": gemini_role,
                "parts": [{ "text": &msg.content }]
            }));
        }

        let body = json!({
            "system_instruction": {
                "parts": [{ "text": &sys }]
            },
            "contents": contents,
            "generationConfig": {
                "temperature": 0.7,
                "maxOutputTokens": 2048
            }
        });

        let response = client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("HTTP request failed: {}", e))?;

        let status = response.status();
        if !status.is_success() {
            let err = response.text().await.unwrap_or_default();
            return Err(format!("Gemini API error {}: {}", status, err));
        }

        let resp: GeminiResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Gemini response: {}", e))?;

        resp.candidates
            .into_iter()
            .next()
            .and_then(|c| c.content.parts.into_iter().next())
            .map(|p| p.text)
            .ok_or_else(|| "Gemini returned no candidates".to_string())
    } else {
        // OpenAI-compatible: multi-turn conversation
        let url = format!("{}/v1/chat/completions", provider_base_url.trim_end_matches('/'));

        let mut chat_messages = vec![
            ChatMessage { role: "system".to_string(), content: sys },
        ];
        for msg in &messages {
            chat_messages.push(ChatMessage {
                role: msg.role.clone(),
                content: msg.content.clone(),
            });
        }

        let body = ChatCompletionRequest {
            model: model.to_string(),
            messages: chat_messages,
        };

        let response = client
            .post(&url)
            .bearer_auth(&api_key)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("HTTP request failed: {}", e))?;

        let status = response.status();
        if !status.is_success() {
            let err = response.text().await.unwrap_or_default();
            return Err(format!("API error {}: {}", status, err));
        }

        let resp: ChatCompletionResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;

        resp.choices
            .into_iter()
            .next()
            .map(|c| c.message.content)
            .ok_or_else(|| "API returned no choices".to_string())
    }
}

// ── File reading with PDF / DOCX support ─────────────────────────────────────

fn extract_text_from_pdf(path: &str) -> Result<String, String> {
    let doc = lopdf::Document::load(path)
        .map_err(|e| format!("Failed to load PDF: {}", e))?;

    let mut text = String::new();
    let pages: Vec<u32> = doc.get_pages().keys().copied().collect();

    for page_num in pages {
        if let Ok(page_text) = doc.extract_text(&[page_num]) {
            text.push_str(&page_text);
            text.push('\n');
        }
    }

    if text.trim().is_empty() {
        return Err("PDF appears to contain no extractable text (may be image-based)".to_string());
    }
    Ok(text)
}

fn extract_text_from_docx(path: &str) -> Result<String, String> {
    let file = fs::File::open(path)
        .map_err(|e| format!("Failed to open DOCX: {}", e))?;

    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("Failed to read DOCX ZIP: {}", e))?;

    let mut xml_content = String::new();
    {
        let mut doc_xml = archive.by_name("word/document.xml")
            .map_err(|_| "Not a valid DOCX file (word/document.xml missing)".to_string())?;
        doc_xml.read_to_string(&mut xml_content)
            .map_err(|e| format!("Failed to read document.xml: {}", e))?;
    }

    // Strip XML tags, preserve paragraph breaks
    let mut text = String::new();
    let mut in_tag = false;
    let mut after_para = false;

    for ch in xml_content.chars() {
        match ch {
            '<' => {
                in_tag = true;
                // Check if we're closing a paragraph/run tag — we'll detect via tag name
            }
            '>' => {
                in_tag = false;
                if after_para {
                    text.push('\n');
                    after_para = false;
                }
            }
            _ if !in_tag => text.push(ch),
            _ => {}
        }
    }

    // Better approach: use regex-free XML parsing
    // Replace </w:p> with newlines before stripping tags
    let with_breaks = xml_content
        .replace("</w:p>", "\n")
        .replace("</w:tr>", "\n");

    // Now strip all XML tags
    let mut result = String::new();
    let mut in_xml_tag = false;
    for ch in with_breaks.chars() {
        match ch {
            '<' => in_xml_tag = true,
            '>' => in_xml_tag = false,
            _ if !in_xml_tag => result.push(ch),
            _ => {}
        }
    }

    // Collapse multiple blank lines
    let lines: Vec<&str> = result.lines().collect();
    let clean: Vec<&str> = lines
        .iter()
        .filter(|l| !l.trim().is_empty())
        .copied()
        .collect();

    let final_text = clean.join("\n");
    if final_text.trim().is_empty() {
        return Err("DOCX appears to contain no text content".to_string());
    }
    Ok(final_text)
}

#[tauri::command]
pub fn read_text_file(file_path: String) -> Result<String, String> {
    info!("Reading file: {}", file_path);

    let lower = file_path.to_lowercase();

    if lower.ends_with(".pdf") {
        return extract_text_from_pdf(&file_path);
    }

    if lower.ends_with(".docx") {
        return extract_text_from_docx(&file_path);
    }

    // Plain text fallback (.txt, .md, etc.)
    fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read file '{}': {}", file_path, e))
}
