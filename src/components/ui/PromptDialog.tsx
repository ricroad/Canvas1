import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { UI_CONTENT_OVERLAY_INSET_CLASS, UI_DIALOG_TRANSITION_MS } from './motion';
import { useDialogTransition } from './useDialogTransition';

interface PromptDialogProps {
  open: boolean;
  title: string;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: (value: string) => void | Promise<void>;
  onCancel: () => void;
  maxLength?: number;
}

function isPromiseLike(value: void | Promise<void>): value is Promise<void> {
  return Boolean(value && typeof (value as Promise<void>).then === 'function');
}

export function PromptDialog({
  open,
  title,
  defaultValue = '',
  placeholder,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
  maxLength,
}: PromptDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isSubmittingRef = useRef(false);
  const [value, setValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { shouldRender, isVisible } = useDialogTransition(open, UI_DIALOG_TRANSITION_MS);
  const normalizedValue = value.trim();
  const canSubmit = normalizedValue.length > 0 && !isSubmitting;

  useEffect(() => {
    let frameId = 0;

    if (!open) {
      setValue('');
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      return undefined;
    }

    setValue(defaultValue);
    frameId = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [defaultValue, open]);

  const submit = async () => {
    if (normalizedValue.length === 0 || isSubmittingRef.current) {
      return;
    }

    isSubmittingRef.current = true;
    try {
      const result = onConfirm(normalizedValue);
      if (isPromiseLike(result)) {
        setIsSubmitting(true);
        await result;
      }
    } catch (error) {
      console.error('Prompt dialog confirmation failed', error);
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void submit();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  };

  if (!shouldRender) {
    return null;
  }

  return (
    <div className={`fixed ${UI_CONTENT_OVERLAY_INSET_CLASS} z-50 flex items-center justify-center`}>
      <div
        className={`absolute inset-0 bg-black/90 transition-opacity duration-200 ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative w-[min(92vw,400px)] overflow-hidden rounded-lg border border-border-dark bg-surface-dark shadow-xl transition-opacity duration-200 ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="border-b border-border-dark px-5 py-4">
          <h2 id={titleId} className="text-base font-semibold text-text-dark">
            {title}
          </h2>
        </div>

        <div className="px-5 py-4">
          <input
            ref={inputRef}
            type="text"
            value={value}
            maxLength={maxLength}
            placeholder={placeholder}
            disabled={isSubmitting}
            onChange={(event) => setValue(event.currentTarget.value)}
            onKeyDown={handleInputKeyDown}
            className="h-9 w-full rounded border border-border-dark bg-surface-dark px-3 text-sm text-text-dark outline-none transition-colors placeholder:text-text-muted focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>

        <div className="flex justify-end gap-2 border-t border-border-dark px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="rounded border border-border-dark px-4 py-2 text-sm font-medium text-text-dark transition-colors hover:bg-bg-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cancelText ?? t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit}
            className="inline-flex min-w-[72px] items-center justify-center rounded bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : confirmText ?? t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
