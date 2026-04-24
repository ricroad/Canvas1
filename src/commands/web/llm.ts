/**
 * Web-side LLM calls — direct fetch to provider APIs.
 * Mirrors the Rust backend's chat_completion / generate_storyboard_prompts logic.
 */

// ── OpenAI-compatible ────────────────────────────────────────────────────────

async function callOpenAICompatible(
  baseUrl: string,
  model: string,
  apiKey: string,
  messages: { role: string; content: string }[],
): Promise<string> {
  const url = `${baseUrl.replace(/\/+$/, '')}/v1/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`API error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

// ── Gemini ────────────────────────────────────────────────────────────────────

async function callGemini(
  baseUrl: string,
  model: string,
  apiKey: string,
  systemPrompt: string,
  messages: { role: string; content: string }[],
): Promise<string> {
  const url = `${baseUrl.replace(/\/+$/, '')}/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Gemini API error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isGemini(baseUrl: string): boolean {
  return baseUrl.includes('generativelanguage.googleapis.com');
}

const DEFAULT_SYSTEM_PROMPT =
  '你是 Storyboard 智能助手，专注于影视分镜、剧本分析和创意工作。用简洁友好的方式回答用户的问题。';

// ── Public API ───────────────────────────────────────────────────────────────

export async function webChatCompletion(params: {
  messages: { role: string; content: string }[];
  model: string;
  apiKey: string;
  providerBaseUrl: string;
  systemPrompt?: string;
}): Promise<string> {
  const sys = params.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;

  if (isGemini(params.providerBaseUrl)) {
    return callGemini(params.providerBaseUrl, params.model, params.apiKey, sys, params.messages);
  }

  const msgs = [{ role: 'system', content: sys }, ...params.messages];
  return callOpenAICompatible(params.providerBaseUrl, params.model, params.apiKey, msgs);
}

const STORYBOARD_SYSTEM_PROMPT = `你是一位专业的影视分镜导演。用户会提供剧本内容，你需要为每个镜头生成适合AI图像生成的详细提示词。

要求：
1. 每个镜头提示词必须包含：场景构图、人物位置与动作、光线氛围、镜头角度、情感基调
2. 提示词语言为中文，风格简洁专业，50-150字
3. 严格按照JSON格式返回，格式为字符串数组：["镜头1提示词", "镜头2提示词", ...]
4. 只返回JSON数组，不要有其他文字`;

export async function webGenerateStoryboardPrompts(params: {
  scriptText: string;
  episode?: string;
  scene?: string;
  shotCount: number;
  styleHint?: string;
  model: string;
  apiKey: string;
  providerBaseUrl: string;
}): Promise<string[]> {
  const episodeInfo = params.episode ? `集数：${params.episode}\n` : '';
  const sceneInfo = params.scene ? `场次：${params.scene}\n` : '';
  const styleInfo = params.styleHint ? `风格要求：${params.styleHint}` : '';
  const userMessage = `剧本内容：\n${params.scriptText}\n\n${episodeInfo}${sceneInfo}请生成${params.shotCount}个镜头的分镜提示词。\n${styleInfo}`;

  let content: string;
  if (isGemini(params.providerBaseUrl)) {
    content = await callGemini(
      params.providerBaseUrl, params.model, params.apiKey,
      STORYBOARD_SYSTEM_PROMPT, [{ role: 'user', content: userMessage }],
    );
  } else {
    content = await callOpenAICompatible(params.providerBaseUrl, params.model, params.apiKey, [
      { role: 'system', content: STORYBOARD_SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ]);
  }

  // Parse JSON array from response
  const trimmed = content.trim();
  const start = trimmed.indexOf('[');
  const end = trimmed.lastIndexOf(']');
  if (start === -1 || end === -1) throw new Error('LLM did not return a JSON array');
  const arr = JSON.parse(trimmed.slice(start, end + 1));
  if (!Array.isArray(arr) || arr.length === 0) throw new Error('LLM returned empty prompts');
  return arr.filter((item): item is string => typeof item === 'string');
}

export async function webReadTextFile(file: File): Promise<string> {
  return await file.text();
}
