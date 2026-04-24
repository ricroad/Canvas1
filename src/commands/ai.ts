import { invoke } from '@tauri-apps/api/core';
import { isTauriEnv } from './platform';

export interface GenerateRequest {
  prompt: string;
  model: string;
  size: string;
  aspect_ratio: string;
  reference_images?: string[];
  extra_params?: Record<string, unknown>;
  output_count?: number;
}

export interface SubmitVideoBatchRequest {
  providerId: string;
  nodeId: string;
  batchId: string;
  prompt: string;
  modelId: string;
  negativePrompt?: string;
  duration: number;
  aspectRatio: string;
  outputCount: number;
  slotRefs: Record<string, string>;
  extraParams: Record<string, unknown>;
  accessKey: string;
  secretKey: string;
}

export interface CancelVideoBatchRequest {
  nodeId: string;
  batchId: string;
}

export type GenerationJobState = 'queued' | 'running' | 'succeeded' | 'failed' | 'not_found';

export interface GenerationJobStatus {
  job_id: string;
  status: GenerationJobState;
  result?: string | null;
  error?: string | null;
}

export interface SubmitVideoBatchResponse {
  batchId: string;
  subTasks: Array<{
    subTaskId: string;
    variantId: string;
    klingTaskId: string;
  }>;
}

export interface TestKlingConnectionRequest {
  accessKey: string;
  secretKey: string;
}

const BASE64_PREVIEW_HEAD = 96;
const BASE64_PREVIEW_TAIL = 24;

function truncateText(value: string, max = 200): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max)}...(${value.length} chars)`;
}

function truncateBase64Like(value: string): string {
  if (!value) {
    return value;
  }

  if (value.startsWith('data:')) {
    const [meta, payload = ''] = value.split(',', 2);
    if (payload.length <= BASE64_PREVIEW_HEAD + BASE64_PREVIEW_TAIL) {
      return value;
    }
    return `${meta},${payload.slice(0, BASE64_PREVIEW_HEAD)}...${payload.slice(-BASE64_PREVIEW_TAIL)}(${payload.length} chars)`;
  }

  const base64Like = /^[A-Za-z0-9+/=]+$/.test(value) && value.length > 256;
  if (!base64Like) {
    return truncateText(value, 280);
  }

  return `${value.slice(0, BASE64_PREVIEW_HEAD)}...${value.slice(-BASE64_PREVIEW_TAIL)}(${value.length} chars)`;
}

function sanitizeGenerateRequestForLog(request: GenerateRequest): Record<string, unknown> {
  return {
    prompt: truncateText(request.prompt, 240),
    model: request.model,
    size: request.size,
    aspect_ratio: request.aspect_ratio,
    reference_images_count: request.reference_images?.length ?? 0,
    reference_images_preview: (request.reference_images ?? []).map((item) =>
      truncateBase64Like(item)
    ),
    extra_params: request.extra_params ?? {},
  };
}

interface ErrorWithDetails extends Error {
  details?: string;
}

function normalizeInvokeError(error: unknown): { message: string; details?: string } {
  if (error instanceof Error) {
    const detailsText =
      'details' in error
        ? typeof (error as { details?: unknown }).details === 'string'
          ? (error as { details?: string }).details
          : undefined
        : undefined;
    return { message: error.message || 'Generation failed', details: detailsText };
  }

  if (typeof error === 'string') {
    return { message: error || 'Generation failed', details: error || undefined };
  }

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const message =
      (typeof record.message === 'string' && record.message) ||
      (typeof record.error === 'string' && record.error) ||
      (typeof record.msg === 'string' && record.msg) ||
      'Generation failed';
    let details: string | undefined;
    try {
      details = truncateText(JSON.stringify(record, null, 2), 2000);
    } catch {
      details = truncateText(String(record), 2000);
    }
    return { message, details };
  }

  return { message: 'Generation failed' };
}

function createErrorWithDetails(message: string, details?: string): ErrorWithDetails {
  const error: ErrorWithDetails = new Error(message);
  if (details) {
    error.details = details;
  }
  return error;
}

export async function setApiKey(provider: string, apiKey: string): Promise<void> {
  console.info('[AI] set_api_key', {
    provider,
    apiKeyMasked: apiKey ? `${apiKey.slice(0, 4)}***${apiKey.slice(-2)}` : '',
    tauri: isTauriEnv(),
  });
  if (!isTauriEnv()) {
    throw new Error('图片生成功能暂不支持 Web 版本，请使用桌面客户端');
  }
  return await invoke('set_api_key', { provider, apiKey });
}

export async function generateImage(request: GenerateRequest): Promise<string> {
  const startedAt = performance.now();
  console.info('[AI] generate_image request', {
    ...sanitizeGenerateRequestForLog(request),
    tauri: isTauriEnv(),
  });

  if (!isTauriEnv()) {
    throw new Error('图片生成功能暂不支持 Web 版本，请使用桌面客户端');
  }

  try {
    const rawResult = await invoke<unknown>('generate_image', { request });
    if (typeof rawResult !== 'string') {
      throw createErrorWithDetails(
        'Generation returned non-string payload',
        truncateText(
          (() => {
            try {
              return JSON.stringify(rawResult, null, 2);
            } catch {
              return String(rawResult);
            }
          })(),
          2000
        )
      );
    }
    const result = rawResult.trim();
    if (!result) {
      throw createErrorWithDetails('Generation returned empty image source');
    }
    const elapsedMs = Math.round(performance.now() - startedAt);
    console.info('[AI] generate_image success', {
      elapsedMs,
      resultPreview: truncateText(result, 220),
    });
    return result;
  } catch (error) {
    const elapsedMs = Math.round(performance.now() - startedAt);
    const normalizedError = normalizeInvokeError(error);
    console.error('[AI] generate_image failed', {
      elapsedMs,
      request: sanitizeGenerateRequestForLog(request),
      error,
      normalizedError,
    });
    const commandError: ErrorWithDetails = new Error(normalizedError.message);
    commandError.details = normalizedError.details;
    throw commandError;
  }
}

export async function submitGenerateImageJob(request: GenerateRequest): Promise<string> {
  console.info('[AI] submit_generate_image_job request', {
    ...sanitizeGenerateRequestForLog(request),
    tauri: isTauriEnv(),
  });

  if (!isTauriEnv()) {
    throw new Error('图片生成功能暂不支持 Web 版本，请使用桌面客户端');
  }

  const jobId = await invoke<string>('submit_generate_image_job', { request });
  if (typeof jobId !== 'string' || !jobId.trim()) {
    throw new Error('submit_generate_image_job returned invalid job id');
  }
  return jobId.trim();
}

export async function getGenerateImageJob(jobId: string): Promise<GenerationJobStatus> {
  if (!isTauriEnv()) {
    throw new Error('图片生成功能暂不支持 Web 版本，请使用桌面客户端');
  }

  const result = await invoke<GenerationJobStatus>('get_generate_image_job', { jobId });
  if (!result || typeof result !== 'object' || typeof result.status !== 'string') {
    throw new Error('get_generate_image_job returned invalid payload');
  }
  return result;
}

export async function listModels(): Promise<string[]> {
  return await invoke('list_models');
}

export async function submitVideoBatch(
  request: SubmitVideoBatchRequest
): Promise<SubmitVideoBatchResponse> {
  console.info('[AI] submit_video_batch request', {
    nodeId: request.nodeId,
    batchId: request.batchId,
    providerId: request.providerId,
    modelId: request.modelId,
    outputCount: request.outputCount,
    duration: request.duration,
    aspectRatio: request.aspectRatio,
    extraParams: request.extraParams,
    prompt: truncateText(request.prompt, 240),
    negativePrompt: truncateText(request.negativePrompt ?? '', 120),
    firstFramePreview: truncateBase64Like(request.slotRefs['image-first-frame'] ?? ''),
    tailFramePreview: truncateBase64Like(request.slotRefs['image-tail-frame'] ?? ''),
    tauri: isTauriEnv(),
  });

  if (!isTauriEnv()) {
    throw new Error('Video generation is currently desktop-only.');
  }

  const response = await invoke<SubmitVideoBatchResponse>('submit_video_batch', { request });
  if (
    !response
    || typeof response.batchId !== 'string'
    || !response.batchId.trim()
    || !Array.isArray(response.subTasks)
  ) {
    throw new Error('submit_video_batch returned invalid payload');
  }
  return {
    batchId: response.batchId.trim(),
    subTasks: response.subTasks
      .filter((item) => item && typeof item.klingTaskId === 'string' && typeof item.subTaskId === 'string')
      .map((item) => ({
        subTaskId: item.subTaskId.trim(),
        variantId: typeof item.variantId === 'string' && item.variantId.trim()
          ? item.variantId.trim()
          : item.subTaskId.trim(),
        klingTaskId: item.klingTaskId.trim(),
      })),
  };
}

export async function cancelVideoBatch(request: CancelVideoBatchRequest): Promise<void> {
  if (!isTauriEnv()) {
    throw new Error('Video generation is currently desktop-only.');
  }
  await invoke('cancel_video_batch', { request });
}

export async function testKlingConnection(request: TestKlingConnectionRequest): Promise<void> {
  if (!isTauriEnv()) {
    throw new Error('Kling connection test is currently desktop-only.');
  }
  await invoke('test_kling_connection', { request });
}
