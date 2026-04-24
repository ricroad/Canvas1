export interface LlmModelDefinition {
  id: string;
  displayName: string;
  providerId: string;
  baseUrl: string;
}

const GOOGLE_BASE = 'https://generativelanguage.googleapis.com';
const PPIO_BASE = 'https://api.ppio.com';
const MOONSHOT_BASE = 'https://api.moonshot.cn';

export const LLM_MODELS: LlmModelDefinition[] = [
  {
    id: 'kimi-k2.5',
    displayName: 'Kimi K2.5',
    providerId: 'moonshot',
    baseUrl: MOONSHOT_BASE,
  },
  {
    id: 'gemini-3.1-pro-preview',
    displayName: 'Gemini 3.1 Pro',
    providerId: 'google',
    baseUrl: GOOGLE_BASE,
  },
  {
    id: 'gemini-3.1-flash-lite-preview',
    displayName: 'Gemini 3.1 Flash Lite',
    providerId: 'google',
    baseUrl: GOOGLE_BASE,
  },
  {
    id: 'gemini-2.5-pro',
    displayName: 'Gemini 2.5 Pro',
    providerId: 'google',
    baseUrl: GOOGLE_BASE,
  },
  {
    id: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    providerId: 'google',
    baseUrl: GOOGLE_BASE,
  },
  {
    id: 'gemini-2.5-flash-lite',
    displayName: 'Gemini 2.5 Flash Lite',
    providerId: 'google',
    baseUrl: GOOGLE_BASE,
  },
  {
    id: 'gemini-2.0-flash',
    displayName: 'Gemini 2.0 Flash',
    providerId: 'google',
    baseUrl: GOOGLE_BASE,
  },
  {
    id: 'deepseek/deepseek-v3',
    displayName: 'DeepSeek V3 (PPIO)',
    providerId: 'ppio',
    baseUrl: PPIO_BASE,
  },
  {
    id: 'deepseek/deepseek-r1',
    displayName: 'DeepSeek R1 (PPIO)',
    providerId: 'ppio',
    baseUrl: PPIO_BASE,
  },
  {
    id: 'qwen/qwen3-235b-a22b',
    displayName: 'Qwen3 235B (PPIO)',
    providerId: 'ppio',
    baseUrl: PPIO_BASE,
  },
];

export const DEFAULT_LLM_MODEL_ID = LLM_MODELS[0].id;

export function getLlmModel(id: string): LlmModelDefinition {
  return LLM_MODELS.find((model) => model.id === id) ?? LLM_MODELS[0];
}
