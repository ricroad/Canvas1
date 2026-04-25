import { chatCompletion } from '@/commands/llm';
import type { VideoModelDefinition } from '@/features/canvas/models/types';

export interface ChooseVideoModelInput {
  prompt: string;
  negativePrompt?: string;
  currentModelId: string;
  hasFirstFrame: boolean;
  hasTailFrame: boolean;
  models: VideoModelDefinition[];
  llm: {
    model: string;
    apiKey: string;
    providerBaseUrl: string;
  };
}

export interface ChooseVideoModelResult {
  modelId: string;
  reason?: string;
}

interface LlmVideoModelChoice {
  modelId?: string;
  reason?: string;
}

function extractJsonObject(text: string): LlmVideoModelChoice {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('No JSON object returned');
  }
  return JSON.parse(trimmed.slice(start, end + 1)) as LlmVideoModelChoice;
}

export async function chooseVideoModel(input: ChooseVideoModelInput): Promise<ChooseVideoModelResult> {
  const modelOptions = input.models.map((model) => ({
    id: model.id,
    name: model.displayName,
    description: model.description,
    supportedDurations: model.supportedDurations,
    supportedModes: model.supportedModes,
    creditsPerSecond: model.creditsPerSecond,
    tailFrameSupported: model.inputSlots.some((slot) => slot.handleId === 'image-tail-frame'),
  }));
  const response = await chatCompletion({
    model: input.llm.model,
    apiKey: input.llm.apiKey,
    providerBaseUrl: input.llm.providerBaseUrl,
    systemPrompt:
      'You choose only the video generation model type. Do not choose duration, aspect ratio, mode, or any other generation parameter. Return only JSON: {"modelId":"...","reason":"..."}',
    messages: [
      {
        role: 'user',
        content: JSON.stringify({
          prompt: input.prompt,
          negativePrompt: input.negativePrompt ?? '',
          currentModelId: input.currentModelId,
          inputs: {
            hasFirstFrame: input.hasFirstFrame,
            hasTailFrame: input.hasTailFrame,
          },
          modelOptions,
          instruction:
            'Pick one modelId from modelOptions. Prefer the base model for simple, stable shot motion. Pick a stronger model only when prompt complexity, camera movement, transformation, or longer action semantics justify it.',
        }),
      },
    ],
  });
  const choice = extractJsonObject(response);
  const selectedModel = input.models.find((model) => model.id === choice.modelId);
  if (!selectedModel) {
    throw new Error('LLM returned an unknown video model');
  }

  return {
    modelId: selectedModel.id,
    reason: typeof choice.reason === 'string' ? choice.reason.slice(0, 120) : undefined,
  };
}
