import { invoke } from '@tauri-apps/api/core';
import { isTauriEnv } from './platform';
import { webChatCompletion, webGenerateStoryboardPrompts } from './web/llm';

export interface GenerateStoryboardPromptsParams {
  scriptText: string;
  episode?: string;
  scene?: string;
  shotCount: number;
  styleHint?: string;
  model: string;
  apiKey: string;
  providerBaseUrl: string;
}

export async function generateStoryboardPrompts(
  params: GenerateStoryboardPromptsParams
): Promise<string[]> {
  if (!isTauriEnv()) return webGenerateStoryboardPrompts(params);

  return invoke<string[]>('generate_storyboard_prompts', {
    scriptText: params.scriptText,
    episode: params.episode ?? null,
    scene: params.scene ?? null,
    shotCount: params.shotCount,
    styleHint: params.styleHint ?? null,
    model: params.model,
    apiKey: params.apiKey,
    providerBaseUrl: params.providerBaseUrl,
  });
}

export interface ChatCompletionParams {
  messages: { role: string; content: string }[];
  model: string;
  apiKey: string;
  providerBaseUrl: string;
  systemPrompt?: string;
}

export async function chatCompletion(params: ChatCompletionParams): Promise<string> {
  if (!isTauriEnv()) return webChatCompletion(params);

  return invoke<string>('chat_completion', {
    messages: params.messages,
    model: params.model,
    apiKey: params.apiKey,
    providerBaseUrl: params.providerBaseUrl,
    systemPrompt: params.systemPrompt ?? null,
  });
}

export async function readTextFile(filePath: string): Promise<string> {
  if (!isTauriEnv()) {
    // In web mode, file reading is handled by the File API at the UI layer.
    // This path should not be reached; throw a clear error.
    throw new Error('readTextFile(path) is not available in Web mode — use File API instead');
  }
  return invoke<string>('read_text_file', { filePath });
}
