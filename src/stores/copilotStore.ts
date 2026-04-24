import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_LLM_MODEL_ID } from '@/features/canvas/models/llm';

/**
 * Message types:
 * - text: plain text bubble
 * - scriptPreview: file upload card with preview
 * - promptList: generated prompts as an editable card
 * - action: inline action buttons (confirm / regenerate / etc.)
 * - loading: typing indicator
 */
export type MessageType = 'text' | 'scriptPreview' | 'promptList' | 'action' | 'loading';

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  type: MessageType;
  content: string;
  /** Extra payload: prompts array, file name, etc. */
  meta?: Record<string, unknown>;
  timestamp: number;
}

export type CopilotStage =
  | 'idle'
  | 'scriptUploaded'
  | 'configuring'
  | 'generating'
  | 'review'
  | 'confirmed';

interface CopilotState {
  isOpen: boolean;
  stage: CopilotStage;
  isProcessing: boolean;

  scriptText: string | null;
  scriptFileName: string | null;

  /** LLM generation parameters */
  shotCount: number;
  styleHint: string;
  llmModelId: string;

  /** Generated prompts from LLM */
  generatedPrompts: string[];

  messages: CopilotMessage[];

  /* ---- Actions ---- */
  togglePanel: () => void;
  setOpen: (open: boolean) => void;

  appendMessage: (msg: Omit<CopilotMessage, 'id' | 'timestamp'>) => string;
  removeMessage: (id: string) => void;
  updateMessageMeta: (id: string, meta: Record<string, unknown>) => void;

  setScriptData: (fileName: string, text: string) => void;
  setShotCount: (count: number) => void;
  setStyleHint: (hint: string) => void;
  setLlmModelId: (id: string) => void;
  setStage: (stage: CopilotStage) => void;
  setProcessing: (v: boolean) => void;

  setGeneratedPrompts: (prompts: string[]) => void;
  updatePrompt: (index: number, value: string) => void;

  reset: () => void;
}

let msgSeq = 0;
function nextId(): string {
  msgSeq += 1;
  return `m-${Date.now()}-${msgSeq}`;
}

export const useCopilotStore = create<CopilotState>()(
  persist(
    (set) => ({
      isOpen: true,
      stage: 'idle',
      isProcessing: false,

      scriptText: null,
      scriptFileName: null,

      shotCount: 6,
      styleHint: '',
      llmModelId: DEFAULT_LLM_MODEL_ID,

      generatedPrompts: [],
      messages: [],

      togglePanel: () => set((s) => ({ isOpen: !s.isOpen })),
      setOpen: (open) => set({ isOpen: open }),

      appendMessage: (partial) => {
        const id = nextId();
        const msg: CopilotMessage = { ...partial, id, timestamp: Date.now() };
        set((s) => ({ messages: [...s.messages, msg] }));
        return id;
      },

      removeMessage: (id) =>
        set((s) => ({ messages: s.messages.filter((m) => m.id !== id) })),

      updateMessageMeta: (id, meta) =>
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === id ? { ...m, meta: { ...m.meta, ...meta } } : m,
          ),
        })),

      setScriptData: (fileName, text) =>
        set({ scriptText: text, scriptFileName: fileName }),

      setShotCount: (count) => set({ shotCount: count }),
      setStyleHint: (hint) => set({ styleHint: hint }),
      setLlmModelId: (id) => set({ llmModelId: id }),
      setStage: (stage) => set({ stage }),
      setProcessing: (v) => set({ isProcessing: v }),

      setGeneratedPrompts: (prompts) => set({ generatedPrompts: prompts }),

      updatePrompt: (index, value) =>
        set((s) => {
          const updated = [...s.generatedPrompts];
          updated[index] = value;
          return { generatedPrompts: updated };
        }),

      reset: () =>
        set({
          stage: 'idle',
          isProcessing: false,
          scriptText: null,
          scriptFileName: null,
          generatedPrompts: [],
          shotCount: 6,
          styleHint: '',
          messages: [],
        }),
    }),
    {
      name: 'copilot-store',
      partialize: (state) => ({
        isOpen: state.isOpen,
        llmModelId: state.llmModelId,
      }),
    },
  ),
);
