import {
  cloneElement,
  isValidElement,
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp, BarChart3, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { getModelProvider } from '@/features/canvas/models';
import { UiCheckbox, UiChipButton, UiInput, UiPanel, UiSelect } from '@/components/ui';

type ParamValue = boolean | number | string;

export interface ModelDisplayParts {
  name: string;
  variant?: string;
}

export interface ModelParamsModel {
  id: string;
  displayName: string;
  providerId?: string;
}

interface BaseParamField {
  key: string;
  label: string;
  value: ParamValue;
  displayFormat?: (value: ParamValue) => string;
}

export interface SelectParamField extends BaseParamField {
  kind: 'select';
  options: Array<{ value: string | number; label: string }>;
}

export interface ToggleParamField extends BaseParamField {
  kind: 'toggle';
}

export interface NumberParamField extends BaseParamField {
  kind: 'number';
  min?: number;
  max?: number;
  step?: number;
}

export type ParamField = SelectParamField | ToggleParamField | NumberParamField;

interface PanelAnchor {
  left: number;
  top: number;
}

interface ModelParamsControlsProps<TModel extends ModelParamsModel = ModelParamsModel> {
  models: TModel[];
  selectedModel: TModel;
  onModelChange: (modelId: string) => void;
  modelIcon?: ReactNode;
  getModelDisplayParts: (model: TModel) => ModelDisplayParts;
  paramFields: ParamField[];
  paramIcon?: ReactNode;
  onParamChange: (key: string, value: ParamValue) => void;
  onSubmit: (event?: ReactMouseEvent<HTMLButtonElement>) => void;
  submitDisabled?: boolean;
  submitIcon?: ReactNode;
  submitVariant?: 'circle' | 'text';
  submitLabel?: string;
  submitTitle?: string;
  topToolbar?: ReactNode;
  modelPanelToolbar?: ReactNode;
  tokenBadge?: ReactNode | { value: number | string };
  className?: string;
  triggerSize?: 'md' | 'sm';
  chipClassName?: string;
  modelChipClassName?: string;
  paramsChipClassName?: string;
  modelPanelAlign?: 'center' | 'start';
  paramsPanelAlign?: 'center' | 'start';
  modelPanelClassName?: string;
  paramsPanelClassName?: string;
}

const DEFAULT_MODEL_PANEL_CLASS_NAME = 'inline-block min-w-[300px] max-w-[calc(100vw-32px)] p-2';
const DEFAULT_PARAMS_PANEL_CLASS_NAME = 'w-[420px] max-w-[calc(100vw-32px)] p-3';

function getPanelAnchor(
  triggerElement: HTMLDivElement | null,
  align: 'center' | 'start'
): PanelAnchor | null {
  if (!triggerElement) {
    return null;
  }
  const rect = triggerElement.getBoundingClientRect();
  return {
    left: align === 'center' ? rect.left + rect.width / 2 : rect.left,
    top: rect.top - 8,
  };
}

function buildPanelStyle(
  anchor: PanelAnchor | null,
  align: 'center' | 'start'
): CSSProperties | undefined {
  if (!anchor) {
    return undefined;
  }

  const xTransform = align === 'center' ? 'translateX(-50%) ' : '';
  return {
    left: anchor.left,
    top: anchor.top,
    transform: `${xTransform}translateY(-100%)`,
  };
}

function renderIcon(icon: ReactNode, className: string): ReactNode {
  if (isValidElement<{ className?: string }>(icon)) {
    return cloneElement(icon, {
      className: [className, icon.props.className].filter(Boolean).join(' '),
    });
  }

  return icon;
}

function formatParamField(field: ParamField): string {
  if (field.value === false || field.value === '') {
    return '';
  }

  return field.displayFormat?.(field.value) ?? String(field.value);
}

export const ModelParamsControls = memo(function ModelParamsControls<TModel extends ModelParamsModel = ModelParamsModel>({
  models,
  selectedModel,
  onModelChange,
  modelIcon,
  getModelDisplayParts,
  paramFields,
  paramIcon,
  onParamChange,
  onSubmit,
  submitDisabled = false,
  submitIcon,
  submitVariant = 'text',
  submitLabel,
  submitTitle,
  topToolbar,
  modelPanelToolbar,
  tokenBadge,
  className = '',
  triggerSize = 'md',
  chipClassName = '',
  modelChipClassName = 'w-auto justify-start',
  paramsChipClassName = 'w-auto justify-start',
  modelPanelAlign = 'center',
  paramsPanelAlign = 'center',
  modelPanelClassName = DEFAULT_MODEL_PANEL_CLASS_NAME,
  paramsPanelClassName = DEFAULT_PARAMS_PANEL_CLASS_NAME,
}: ModelParamsControlsProps<TModel>) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const modelTriggerRef = useRef<HTMLDivElement>(null);
  const paramsTriggerRef = useRef<HTMLDivElement>(null);
  const modelPanelRef = useRef<HTMLDivElement>(null);
  const paramsPanelRef = useRef<HTMLDivElement>(null);
  const [openPanel, setOpenPanel] = useState<'model' | 'params' | null>(null);
  const [renderPanel, setRenderPanel] = useState<'model' | 'params' | null>(null);
  const [isPanelVisible, setIsPanelVisible] = useState(false);
  const [modelPanelAnchor, setModelPanelAnchor] = useState<PanelAnchor | null>(null);
  const [paramsPanelAnchor, setParamsPanelAnchor] = useState<PanelAnchor | null>(null);

  const selectedModelParts = useMemo(
    () => getModelDisplayParts(selectedModel),
    [getModelDisplayParts, selectedModel]
  );
  const paramsDisplay = useMemo(
    () =>
      paramFields
        .map((field) => formatParamField(field))
        .filter(Boolean)
        .join(' · '),
    [paramFields]
  );
  const renderedTokenBadge = useMemo(() => {
    if (
      !tokenBadge ||
      isValidElement(tokenBadge) ||
      typeof tokenBadge !== 'object' ||
      !('value' in tokenBadge)
    ) {
      return tokenBadge;
    }

    return (
      <span className="rounded-full border border-[rgba(255,255,255,0.1)] bg-bg-dark/60 px-2 py-0.5 text-[10px] text-text-muted">
        {tokenBadge.value}
      </span>
    );
  }, [tokenBadge]);
  const groupedModels = useMemo(() => {
    const groups = new Map<string, TModel[]>();
    models.forEach((model) => {
      const key = model.providerId ?? 'models';
      groups.set(key, [...(groups.get(key) ?? []), model]);
    });
    return Array.from(groups.entries()).map(([providerId, providerModels]) => ({
      providerId,
      label: providerId === 'models' ? t('modelParams.model') : getModelProvider(providerId).label,
      models: providerModels,
    }));
  }, [models, t]);

  const isCompactTrigger = triggerSize === 'sm';
  const modelIconClassName = isCompactTrigger ? 'h-3 w-3 shrink-0' : 'h-4 w-4 shrink-0';
  const chipTextClassName = isCompactTrigger
    ? 'min-w-0 truncate text-[11px] font-medium leading-none'
    : 'min-w-0 truncate text-sm font-medium';
  const paramsTextClassName = isCompactTrigger
    ? 'min-w-0 truncate text-[11px] leading-none text-text-muted'
    : 'min-w-0 truncate text-xs text-text-muted';

  useEffect(() => {
    const animationDurationMs = 160;
    let enterRaf1: number | null = null;
    let enterRaf2: number | null = null;
    let switchTimer: ReturnType<typeof setTimeout> | null = null;

    const startEnterAnimation = () => {
      enterRaf1 = requestAnimationFrame(() => {
        enterRaf2 = requestAnimationFrame(() => {
          setIsPanelVisible(true);
        });
      });
    };

    if (!openPanel) {
      setIsPanelVisible(false);
      switchTimer = setTimeout(() => setRenderPanel(null), animationDurationMs);
      return () => {
        if (switchTimer) clearTimeout(switchTimer);
        if (enterRaf1) cancelAnimationFrame(enterRaf1);
        if (enterRaf2) cancelAnimationFrame(enterRaf2);
      };
    }

    if (renderPanel && renderPanel !== openPanel) {
      setIsPanelVisible(false);
      switchTimer = setTimeout(() => {
        setRenderPanel(openPanel);
        startEnterAnimation();
      }, animationDurationMs);
      return () => {
        if (switchTimer) clearTimeout(switchTimer);
        if (enterRaf1) cancelAnimationFrame(enterRaf1);
        if (enterRaf2) cancelAnimationFrame(enterRaf2);
      };
    }

    if (!renderPanel) {
      setRenderPanel(openPanel);
    }
    startEnterAnimation();

    return () => {
      if (switchTimer) clearTimeout(switchTimer);
      if (enterRaf1) cancelAnimationFrame(enterRaf1);
      if (enterRaf2) cancelAnimationFrame(enterRaf2);
    };
  }, [openPanel, renderPanel]);

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      const target = event.target as globalThis.Node;
      if (
        containerRef.current?.contains(target) ||
        modelPanelRef.current?.contains(target) ||
        paramsPanelRef.current?.contains(target)
      ) {
        return;
      }
      setOpenPanel(null);
    };

    document.addEventListener('mousedown', handleOutside, true);
    return () => document.removeEventListener('mousedown', handleOutside, true);
  }, []);

  const renderParamEditor = (field: ParamField) => {
    if (field.kind === 'toggle') {
      return (
        <label
          key={field.key}
          className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-[rgba(255,255,255,0.08)] bg-bg-dark/65 px-3 text-xs text-text-dark"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <UiCheckbox
            checked={Boolean(field.value)}
            onCheckedChange={(checked) => onParamChange(field.key, checked)}
          />
          <span className="truncate">{field.label}</span>
        </label>
      );
    }

    if (field.kind === 'number') {
      return (
        <label key={field.key} className="space-y-1.5">
          <span className="block truncate text-[11px] text-text-muted">{field.label}</span>
          <UiInput
            type="number"
            min={field.min}
            max={field.max}
            step={field.step}
            value={typeof field.value === 'number' ? String(field.value) : ''}
            onChange={(event) => onParamChange(field.key, Number(event.target.value))}
            onMouseDown={(event) => event.stopPropagation()}
            className="!h-8 !rounded-md !px-2 !text-[11px]"
          />
        </label>
      );
    }

    return (
      <label key={field.key} className="space-y-1.5">
        <span className="block truncate text-[11px] text-text-muted">{field.label}</span>
        <UiSelect
          value={String(field.value)}
          onChange={(event) => {
            const option = field.options.find((item) => String(item.value) === event.target.value);
            onParamChange(field.key, option?.value ?? event.target.value);
          }}
          className="!h-8 !rounded-md !px-2 !text-[11px]"
          aria-label={field.label}
        >
          {field.options.map((option) => (
            <option key={String(option.value)} value={String(option.value)}>
              {option.label}
            </option>
          ))}
        </UiSelect>
      </label>
    );
  };

  return (
    <div ref={containerRef} className={`flex min-w-0 items-center gap-2 ${className}`}>
      {topToolbar ? <div className="flex items-center gap-1">{topToolbar}</div> : null}

      <div className="flex min-w-0 items-center gap-1">
        <div ref={modelTriggerRef} className="relative flex min-w-0">
          <UiChipButton
            active={openPanel === 'model'}
            className={`${chipClassName} ${modelChipClassName} min-w-0 !border-transparent !bg-transparent !shadow-none hover:!bg-[rgba(255,255,255,0.06)]`}
            onClick={(event) => {
              event.stopPropagation();
              if (openPanel === 'model') {
                setOpenPanel(null);
                return;
              }
              setModelPanelAnchor(getPanelAnchor(modelTriggerRef.current, modelPanelAlign));
              setOpenPanel('model');
            }}
          >
            {modelIcon ? renderIcon(modelIcon, modelIconClassName) : <BarChart3 className={modelIconClassName} />}
            <span className={chipTextClassName}>{selectedModelParts.name}</span>
            {selectedModelParts.variant ? (
              <span className="shrink-0 text-[11px] font-semibold text-accent">{selectedModelParts.variant}</span>
            ) : null}
          </UiChipButton>
        </div>

        <div className="h-5 w-px shrink-0 bg-[rgba(255,255,255,0.12)]" />

        <div ref={paramsTriggerRef} className="relative flex min-w-0">
          <UiChipButton
            active={openPanel === 'params'}
            className={`${chipClassName} ${paramsChipClassName} min-w-0 !border-transparent !bg-transparent !shadow-none hover:!bg-[rgba(255,255,255,0.06)]`}
            onClick={(event) => {
              event.stopPropagation();
              if (openPanel === 'params') {
                setOpenPanel(null);
                return;
              }
              setParamsPanelAnchor(getPanelAnchor(paramsTriggerRef.current, paramsPanelAlign));
              setOpenPanel('params');
            }}
          >
            {paramIcon ? renderIcon(paramIcon, isCompactTrigger ? 'h-3 w-3 shrink-0' : 'h-4 w-4 shrink-0') : (
              <SlidersHorizontal className={isCompactTrigger ? 'h-3 w-3 shrink-0' : 'h-4 w-4 shrink-0'} />
            )}
            <span className={paramsTextClassName}>{paramsDisplay || t('modelParams.params')}</span>
          </UiChipButton>
        </div>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {renderedTokenBadge}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSubmit(event);
          }}
          disabled={submitDisabled}
          title={submitTitle}
          className={
            submitVariant === 'circle'
              ? 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/70 text-white shadow-lg ring-1 ring-white/25 backdrop-blur-md transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50'
              : 'inline-flex h-7 shrink-0 items-center justify-center rounded-md bg-accent px-3 text-xs font-medium text-white transition-colors hover:bg-accent/85 disabled:cursor-not-allowed disabled:opacity-50'
          }
        >
          {submitVariant === 'circle' ? (
            submitIcon ? renderIcon(submitIcon, 'h-4 w-4') : <ArrowUp className="h-4 w-4" strokeWidth={2.8} />
          ) : (
            submitLabel ?? t('canvas.generate')
          )}
        </button>
      </div>

      {typeof document !== 'undefined' && renderPanel === 'model' && createPortal(
        <div
          ref={modelPanelRef}
          className={`fixed z-[80] transition-opacity duration-150 ease-out ${isPanelVisible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
          style={buildPanelStyle(modelPanelAnchor, modelPanelAlign)}
        >
          <UiPanel className={modelPanelClassName}>
            <div className="ui-scrollbar max-h-[340px] space-y-3 overflow-y-auto p-1">
              {modelPanelToolbar ? (
                <div className="border-b border-[rgba(255,255,255,0.08)] pb-2">
                  {modelPanelToolbar}
                </div>
              ) : null}
              {groupedModels.map((group) => (
                <section key={group.providerId}>
                  {groupedModels.length > 1 ? (
                    <div className="mb-2 text-xs font-medium text-text-muted">{group.label}</div>
                  ) : null}
                  <div className="grid grid-cols-2 gap-2">
                    {group.models.map((model) => {
                      const active = model.id === selectedModel.id;
                      const parts = getModelDisplayParts(model);
                      return (
                        <button
                          key={model.id}
                          type="button"
                          className={`min-h-9 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${active
                            ? 'border-accent/50 bg-accent/15 text-text-dark'
                            : 'border-[rgba(255,255,255,0.1)] bg-bg-dark/65 text-text-muted hover:border-[rgba(255,255,255,0.2)] hover:bg-[rgba(255,255,255,0.05)]'
                            }`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onModelChange(model.id);
                            setOpenPanel(null);
                          }}
                        >
                          <span className="block truncate font-medium">{parts.name}</span>
                          {parts.variant ? (
                            <span className="mt-0.5 block text-[10px] font-semibold text-accent">{parts.variant}</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </UiPanel>
        </div>,
        document.body
      )}

      {typeof document !== 'undefined' && renderPanel === 'params' && createPortal(
        <div
          ref={paramsPanelRef}
          className={`fixed z-[80] transition-opacity duration-150 ease-out ${isPanelVisible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
          style={buildPanelStyle(paramsPanelAnchor, paramsPanelAlign)}
        >
          <UiPanel className={paramsPanelClassName}>
            <div className="grid grid-cols-2 gap-3">
              {paramFields.map((field) => renderParamEditor(field))}
            </div>
          </UiPanel>
        </div>,
        document.body
      )}
    </div>
  );
});

ModelParamsControls.displayName = 'ModelParamsControls';
