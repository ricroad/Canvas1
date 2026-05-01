import { memo, useCallback, useRef, useEffect, useState, type KeyboardEvent } from 'react';
import {
  PanelRightClose,
  Send,
  Paperclip,
  FileText,
  Sparkles,
  RotateCcw,
  Check,
  Loader2,
  Bot,
  User,
  AlertCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { openFileDialog, getWebFile } from '@/commands/web/dialog';

import { useCopilotStore, type CopilotMessage } from '@/stores/copilotStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useCanvasStore } from '@/stores/canvasStore';
import { useProjectStore } from '@/stores/projectStore';
import { CANVAS_NODE_TYPES } from '@/features/canvas/domain/canvasNodes';
import { DEFAULT_LLM_MODEL_ID, LLM_MODELS, getLlmModel } from '@/features/canvas/models/llm';
import { readTextFile, chatCompletion } from '@/commands/llm';

const PANEL_WIDTH = 400;
const NODE_H_SPACING = 320;
const NODE_V_OFFSET = 150;

/* ================================================================
 *  Message Components
 *  All use CSS var(--copilot-*) tokens for light/dark adaptivity.
 * ================================================================ */

const Avatar = memo(({ role }: { role: string }) => {
  const isUser = role === 'user';
  return (
    <div
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
      style={{
        background: isUser
          ? 'var(--copilot-bubble-user)'
          : 'var(--copilot-card-bg)',
        boxShadow: 'var(--copilot-card-shadow)',
      }}
    >
      {isUser
        ? <User className="h-3.5 w-3.5 text-accent" />
        : <Bot className="h-3.5 w-3.5" style={{ color: 'var(--copilot-text-secondary)' }} />}
    </div>
  );
});
Avatar.displayName = 'Avatar';

const TextBubble = memo(({ msg }: { msg: CopilotMessage }) => {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      <Avatar role={msg.role} />
      <div
        className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[12.5px] leading-[1.65] whitespace-pre-wrap break-words ${
          isUser
            ? 'ml-auto rounded-tr-md bg-[rgb(var(--accent-rgb)_/_0.10)]'
            : 'rounded-tl-md border border-[color:var(--copilot-bubble-bot-border)] border-l-2 border-l-[color:var(--accent)] bg-[var(--copilot-bubble-bot)]'
        }`}
        style={{
          color: 'var(--copilot-text-primary)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        {msg.content}
      </div>
    </div>
  );
});
TextBubble.displayName = 'TextBubble';

const ScriptCardFull = memo(({ msg }: { msg: CopilotMessage }) => {
  const { t } = useTranslation();
  const fileName = (msg.meta?.fileName as string) ?? '';
  const preview = (msg.meta?.preview as string) ?? '';

  return (
    <div className="flex gap-2.5">
      <Avatar role="assistant" />
      <div
        className="max-w-[82%] overflow-hidden rounded-2xl border border-[color:var(--copilot-card-border)] border-l-2 border-l-[color:var(--accent)]"
        style={{
          background: 'var(--copilot-card-bg)',
          boxShadow: 'var(--copilot-card-shadow)',
        }}
      >
        <div
          className="flex items-center gap-2.5 px-3.5 py-2.5"
          style={{ borderBottom: '1px solid var(--copilot-divider)' }}
        >
          <div
            className="flex h-8 w-8 items-center justify-center rounded-xl"
            style={{ background: 'rgba(var(--accent-rgb) / 0.1)' }}
          >
            <FileText className="h-4 w-4 text-accent" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-medium" style={{ color: 'var(--copilot-text-primary)' }}>
              {fileName}
            </p>
            <p className="text-[10px]" style={{ color: 'var(--copilot-text-tertiary)' }}>
              {t('copilot.scriptUploaded')}
            </p>
          </div>
        </div>
        {preview && (
          <div className="px-3.5 py-2.5">
            <p className="text-[11px] leading-[1.6] line-clamp-4" style={{ color: 'var(--copilot-text-secondary)' }}>
              {preview}
            </p>
          </div>
        )}
      </div>
    </div>
  );
});
ScriptCardFull.displayName = 'ScriptCardFull';

const PromptListCard = memo(({ msg }: { msg: CopilotMessage }) => {
  const prompts = useCopilotStore((s) => s.generatedPrompts);
  const updatePrompt = useCopilotStore((s) => s.updatePrompt);
  const isReview = useCopilotStore((s) => s.stage === 'review');

  return (
    <div className="flex gap-2.5">
      <Avatar role="assistant" />
      <div
        className="max-w-[85%] overflow-hidden rounded-2xl border border-[color:var(--copilot-card-border)] border-l-2 border-l-[color:var(--accent)]"
        style={{
          background: 'var(--copilot-card-bg)',
          boxShadow: 'var(--copilot-card-shadow)',
        }}
      >
        <div
          className="flex items-center gap-2 px-3.5 py-2.5"
          style={{ borderBottom: '1px solid var(--copilot-divider)' }}
        >
          <Sparkles className="h-3.5 w-3.5 text-accent" />
          <p className="text-[11.5px] font-medium" style={{ color: 'var(--copilot-text-primary)' }}>
            {msg.content}
          </p>
        </div>
        <div className="px-3 py-1.5">
          {prompts.map((p, i) => (
            <div
              key={i}
              className="flex gap-2 py-2"
              style={{ borderBottom: i < prompts.length - 1 ? '1px solid var(--copilot-divider)' : 'none' }}
            >
              <span
                className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[9px] font-semibold"
                style={{ background: 'rgba(var(--accent-rgb) / 0.08)', color: 'rgba(var(--accent-rgb) / 0.7)' }}
              >
                {i + 1}
              </span>
              {isReview ? (
                <textarea
                  className="w-full resize-none rounded-xl px-2.5 py-2 text-[11.5px] leading-[1.5] outline-none transition-all duration-150"
                  style={{
                    background: 'var(--copilot-input-bg)',
                    border: '1px solid var(--copilot-input-border)',
                    color: 'var(--copilot-text-primary)',
                  }}
                  rows={2}
                  value={p}
                  onChange={(e) => updatePrompt(i, e.target.value)}
                />
              ) : (
                <p className="text-[11.5px] leading-[1.5]" style={{ color: 'var(--copilot-text-secondary)' }}>{p}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
PromptListCard.displayName = 'PromptListCard';

const SystemBubble = memo(({ msg }: { msg: CopilotMessage }) => (
  <div
    className="mx-4 flex items-start gap-2 rounded-xl px-3 py-2"
    style={{ background: 'rgba(234, 179, 8, 0.06)', border: '1px solid rgba(234, 179, 8, 0.12)' }}
  >
    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-yellow-500" />
    <p className="text-[11px] leading-[1.5] text-yellow-600 dark:text-yellow-400">{msg.content}</p>
  </div>
));
SystemBubble.displayName = 'SystemBubble';

const LoadingBubble = memo(() => (
  <div className="flex gap-2.5">
    <Avatar role="assistant" />
    <div
      className="rounded-2xl rounded-tl-md border border-[color:var(--copilot-bubble-bot-border)] border-l-2 border-l-[color:var(--accent)] bg-[var(--copilot-bubble-bot)] px-4 py-3"
    >
      <div className="flex items-center gap-1.5">
        <span className="h-[5px] w-[5px] animate-bounce rounded-full bg-accent/50 [animation-delay:0ms]" />
        <span className="h-[5px] w-[5px] animate-bounce rounded-full bg-accent/50 [animation-delay:150ms]" />
        <span className="h-[5px] w-[5px] animate-bounce rounded-full bg-accent/50 [animation-delay:300ms]" />
      </div>
    </div>
  </div>
));
LoadingBubble.displayName = 'LoadingBubble';

const MessageRenderer = memo(({ msg }: { msg: CopilotMessage }) => {
  switch (msg.type) {
    case 'scriptPreview': return <ScriptCardFull msg={msg} />;
    case 'promptList': return <PromptListCard msg={msg} />;
    case 'loading': return <LoadingBubble />;
    default:
      if (msg.role === 'system') return <SystemBubble msg={msg} />;
      return <TextBubble msg={msg} />;
  }
});
MessageRenderer.displayName = 'MessageRenderer';

/* ================================================================
 *  Main Panel
 * ================================================================ */

export const CopilotPanel = memo(() => {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [inputValue, setInputValue] = useState('');

  const isOpen = useCopilotStore((s) => s.isOpen);
  const togglePanel = useCopilotStore((s) => s.togglePanel);
  const stage = useCopilotStore((s) => s.stage);
  const messages = useCopilotStore((s) => s.messages);
  const isProcessing = useCopilotStore((s) => s.isProcessing);
  const scriptFileName = useCopilotStore((s) => s.scriptFileName);
  const llmModelId = useCopilotStore((s) => s.llmModelId);
  const shotCount = useCopilotStore((s) => s.shotCount);
  const appendMessage = useCopilotStore((s) => s.appendMessage);
  const removeMessage = useCopilotStore((s) => s.removeMessage);
  const setScriptData = useCopilotStore((s) => s.setScriptData);
  const setShotCount = useCopilotStore((s) => s.setShotCount);
  const setLlmModelId = useCopilotStore((s) => s.setLlmModelId);
  const setStage = useCopilotStore((s) => s.setStage);
  const setProcessing = useCopilotStore((s) => s.setProcessing);
  const reset = useCopilotStore((s) => s.reset);

  const apiKeys = useSettingsStore((s) => s.apiKeys);
  const addNode = useCanvasStore((s) => s.addNode);
  const addEdge = useCanvasStore((s) => s.addEdge);
  const setProjectScriptDocument = useProjectStore((s) => s.setScriptDocument);
  const currentProjectId = useProjectStore((s) => s.currentProjectId);

  useEffect(() => {
    const modelStillExists = LLM_MODELS.some((model) => model.id === llmModelId);
    if (!modelStillExists) {
      setLlmModelId(DEFAULT_LLM_MODEL_ID);
      return;
    }

    const currentModel = getLlmModel(llmModelId);
    const currentProviderKey = (apiKeys[currentModel.providerId] ?? '').trim();
    const defaultModel = getLlmModel(DEFAULT_LLM_MODEL_ID);
    const defaultProviderKey = (apiKeys[defaultModel.providerId] ?? '').trim();

    if (!currentProviderKey && defaultProviderKey && currentModel.id !== defaultModel.id) {
      setLlmModelId(DEFAULT_LLM_MODEL_ID);
    }
  }, [apiKeys, llmModelId, setLlmModelId]);

  useEffect(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    });
  }, [messages.length]);

  useEffect(() => {
    if (stage === 'idle' && messages.length === 0) {
      appendMessage({ role: 'assistant', type: 'text', content: t('copilot.welcomeMessage') });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAttach = useCallback(async () => {
    try {
      const selected = await openFileDialog({
        multiple: false,
        filters: [{ name: 'Script', extensions: ['txt', 'md', 'pdf', 'docx'] }],
      });
      if (!selected) return;
      const fileName = selected.split(/[\\/]/).pop() ?? selected;

      // In web mode, read from the File object; in Tauri, use the backend
      const webFile = getWebFile(selected);
      const content = webFile ? await webFile.text() : await readTextFile(selected);

      setScriptData(fileName, content);
      if (currentProjectId) {
        setProjectScriptDocument(fileName, content);
      }
      setStage('configuring');
      appendMessage({ role: 'user', type: 'text', content: t('copilot.userUploadedScript', { name: fileName }) });
      appendMessage({
        role: 'assistant', type: 'scriptPreview', content: '',
        meta: { fileName, preview: content.slice(0, 300) + (content.length > 300 ? '…' : '') },
      });
      appendMessage({ role: 'assistant', type: 'text', content: t('copilot.scriptLoadedHint') });
    } catch (error) {
      appendMessage({ role: 'system', type: 'text', content: String(error) });
    }
  }, [appendMessage, currentProjectId, setProjectScriptDocument, setScriptData, setStage, t]);

  const handleConfirmCreate = useCallback(() => {
    const prompts = useCopilotStore.getState().generatedPrompts;
    if (prompts.length === 0) return;
    const nodes = useCanvasStore.getState().nodes;
    const maxX = nodes.length > 0 ? Math.max(...nodes.map((n) => (n.position?.x ?? 0) + 300)) : 100;
    const baseY = nodes.length > 0 ? Math.max(...nodes.map((n) => n.position?.y ?? 0)) + NODE_V_OFFSET : 100;
    const ids: string[] = [];
    for (let i = 0; i < prompts.length; i++) {
      ids.push(addNode(CANVAS_NODE_TYPES.imageEdit, { x: maxX + i * NODE_H_SPACING, y: baseY }, { prompt: prompts[i] }));
    }
    for (let i = 0; i < ids.length - 1; i++) addEdge(ids[i], ids[i + 1]);
    setStage('confirmed');
    appendMessage({ role: 'assistant', type: 'text', content: t('copilot.createdNodes', { count: prompts.length }) });
  }, [addNode, addEdge, setStage, appendMessage, t]);

  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    if (!text) return;
    setInputValue('');
    appendMessage({ role: 'user', type: 'text', content: text });

    // Get model & API key
    const model = getLlmModel(llmModelId);
    const apiKey = apiKeys[model.providerId] ?? '';
    if (!apiKey) {
      appendMessage({ role: 'system', type: 'text', content: t('copilot.noApiKey') });
      return;
    }

    // Build conversation history for the LLM (last 20 text messages to stay within context)
    const store = useCopilotStore.getState();
    const history = store.messages
      .filter((m) => m.type === 'text' && (m.role === 'user' || m.role === 'assistant'))
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content }));

    setProcessing(true);
    const loadingId = appendMessage({ role: 'assistant', type: 'loading', content: '' });

    try {
      const reply = await chatCompletion({
        messages: history,
        model: model.id,
        apiKey,
        providerBaseUrl: model.baseUrl,
      });
      removeMessage(loadingId);
      appendMessage({ role: 'assistant', type: 'text', content: reply });
    } catch (error) {
      removeMessage(loadingId);
      appendMessage({ role: 'system', type: 'text', content: String(error) });
    } finally {
      setProcessing(false);
    }
  }, [inputValue, llmModelId, apiKeys, appendMessage, removeMessage, setProcessing, t]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); }
  }, [handleSend]);

  /* ── Collapsed — no render, toggle via LeftStrip button ── */
  if (!isOpen) return null;

  /* ── Expanded — floating card ── */
  return (
    <div
      className="
        absolute right-3 top-3 bottom-3 z-30
        flex flex-col overflow-hidden
        rounded-[20px]
      "
      style={{
        width: `${PANEL_WIDTH}px`,
        background: 'var(--copilot-float-bg)',
        border: '1px solid var(--copilot-float-border)',
        boxShadow: 'var(--copilot-float-shadow)',
        backdropFilter: 'blur(32px) saturate(1.6)',
        WebkitBackdropFilter: 'blur(32px) saturate(1.6)',
      }}
    >
      {/* Header */}
      <div
        className="flex h-12 shrink-0 items-center justify-between px-4"
        style={{ borderBottom: '1px solid var(--copilot-divider)' }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-[10px]"
            style={{ background: 'rgba(var(--accent-rgb) / 0.12)' }}
          >
            <Bot className="h-4 w-4 text-accent" />
          </div>
          <span
            className="text-[13.5px] font-semibold tracking-[-0.01em]"
            style={{ color: 'var(--copilot-text-primary)' }}
          >
            {t('copilot.title')}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          {stage !== 'idle' && (
            <button
              type="button"
              className="rounded-lg p-1.5 transition-all duration-150 hover:opacity-70"
              style={{ color: 'var(--copilot-text-tertiary)' }}
              onClick={() => { reset(); appendMessage({ role: 'assistant', type: 'text', content: t('copilot.welcomeMessage') }); }}
              title={t('copilot.reset')}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            className="rounded-lg p-1.5 transition-all duration-150 hover:opacity-70"
            style={{ color: 'var(--copilot-text-tertiary)' }}
            onClick={togglePanel}
            title={t('copilot.collapse')}
          >
            <PanelRightClose className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3.5 ui-scrollbar">
        {messages.map((msg) => <MessageRenderer key={msg.id} msg={msg} />)}
      </div>

      {/* Context bar */}
      <div
        className="mx-3 mb-2 flex items-center gap-2 rounded-2xl px-3 py-2"
        style={{ background: 'var(--copilot-chip-bg)', border: '1px solid var(--copilot-chip-border)' }}
      >
        {scriptFileName && (
          <div
            className="flex items-center gap-1 rounded-lg px-2 py-0.5"
            style={{ background: 'rgba(var(--accent-rgb) / 0.08)' }}
          >
            <FileText className="h-3 w-3 text-accent/60" />
            <span className="max-w-[80px] truncate text-[10px] text-accent/70">{scriptFileName}</span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <select
            className="rounded-lg border border-[color:var(--brand-ink-700)] px-2 py-1 font-mono text-[10px] outline-none transition-all dark:border-[rgba(11,11,13,0.12)]"
            style={{ background: 'var(--copilot-input-bg)', color: 'var(--copilot-text-secondary)' }}
            value={llmModelId}
            onChange={(e) => setLlmModelId(e.target.value)}
          >
            {LLM_MODELS.map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
          </select>

          {stage === 'configuring' && (
            <div
              className="flex items-center gap-1 rounded-lg px-2 py-1"
              style={{ background: 'var(--copilot-input-bg)', border: '1px solid var(--copilot-input-border)' }}
            >
              <span className="text-[10px]" style={{ color: 'var(--copilot-text-tertiary)' }}>{t('copilot.shotCount')}</span>
              <input
                type="number" min={1} max={50}
                className="w-7 bg-transparent text-center text-[10px] outline-none"
                style={{ color: 'var(--copilot-text-primary)' }}
                value={shotCount}
                onChange={(e) => setShotCount(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
          )}
        </div>
      </div>

      {/* Review action bar */}
      {stage === 'review' && (
        <div className="mx-3 mb-2 flex items-center gap-2">
          <button
            type="button"
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-accent px-4 py-2.5 text-[12.5px] font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
            style={{ boxShadow: '0 2px 12px rgba(var(--accent-rgb) / 0.35)' }}
            onClick={handleConfirmCreate}
          >
            <Check className="h-4 w-4" />
            {t('copilot.confirmAndCreate')}
          </button>
          <button
            type="button"
            className="flex items-center justify-center gap-1.5 rounded-2xl px-3 py-2.5 text-[12px] transition-all hover:opacity-80"
            style={{ background: 'var(--copilot-chip-bg)', border: '1px solid var(--copilot-chip-border)', color: 'var(--copilot-text-secondary)' }}
            onClick={() => { setStage('configuring'); appendMessage({ role: 'assistant', type: 'text', content: t('copilot.regenerateHint') }); }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="px-3 pb-3 pt-1">
        <div
          className="flex items-end gap-1 rounded-2xl border border-[color:var(--copilot-input-border)] px-2 py-1.5 shadow-[var(--copilot-input-shadow)] transition-all duration-200 focus-within:border-[color:var(--accent)] focus-within:shadow-[var(--copilot-input-focus-shadow)]"
          style={{
            background: 'var(--copilot-input-bg)',
          }}
        >
          <button
            type="button"
            className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all hover:opacity-70"
            style={{ color: 'var(--copilot-text-tertiary)' }}
            onClick={() => void handleAttach()}
            title={t('copilot.uploadScript')}
          >
            <Paperclip className="h-[15px] w-[15px]" />
          </button>
          <textarea
            ref={inputRef}
            className="max-h-28 min-h-[24px] flex-1 resize-none bg-transparent py-1.5 text-[12.5px] leading-[1.55] outline-none"
            style={{ color: 'var(--copilot-text-primary)' }}
            rows={1}
            placeholder={t('copilot.inputPlaceholder')}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isProcessing}
          />
          <button
            type="button"
            className={`mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all duration-200 ${
              inputValue.trim() && !isProcessing
                ? 'bg-accent text-white hover:brightness-110 active:scale-[0.92]'
                : 'cursor-default'
            }`}
            style={
              inputValue.trim() && !isProcessing
                ? { boxShadow: '0 2px 8px rgba(var(--accent-rgb) / 0.3)' }
                : { color: 'var(--copilot-text-tertiary)' }
            }
            onClick={() => void handleSend()}
            disabled={!inputValue.trim() || isProcessing}
          >
            {isProcessing
              ? <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--copilot-text-tertiary)' }} />
              : <Send className="h-[15px] w-[15px]" />}
          </button>
        </div>
        {stage === 'configuring' && (
          <p className="mt-1.5 text-center text-[9px] tracking-wide" style={{ color: 'var(--copilot-text-tertiary)' }}>
            {t('copilot.inputHintConfiguring')}
          </p>
        )}
      </div>
    </div>
  );
});
CopilotPanel.displayName = 'CopilotPanel';
