import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { Clapperboard, Image as ImageIcon, Loader2, Sparkles, Swords } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  CANVAS_NODE_TYPES,
  getNodePrimaryImageUrl,
  isVideoGenNode,
  type CanvasEdge,
  type CanvasNode,
  type VideoGenNodeData,
} from '@/features/canvas/domain/canvasNodes';
import { resolveNodeDisplayName } from '@/features/canvas/domain/nodeDisplay';
import { resolveImageDisplayUrl } from '@/features/canvas/application/imageData';
import { MagneticHandle } from '@/features/canvas/ui/MagneticHandle';
import { NodeHeader, NODE_HEADER_FLOATING_POSITION_CLASS } from '@/features/canvas/ui/NodeHeader';
import { NodeResizeHandle } from '@/features/canvas/ui/NodeResizeHandle';
import { ModelParamsControls } from '@/features/canvas/ui/ModelParamsControls';
import { UiButton, UiSwitch } from '@/components/ui';
import { useCanvasStore } from '@/stores/canvasStore';
import { useCopilotStore } from '@/stores/copilotStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { canvasAiGateway } from '@/features/canvas/application/canvasServices';
import { chooseVideoModel } from '@/features/canvas/application/videoModelDecision';
import { getVideoModel, listVideoModels } from '@/features/canvas/models';
import { DEFAULT_LLM_MODEL_ID, getLlmModel } from '@/features/canvas/models/llm';
import {
  NODE_CONTROL_CHIP_CLASS,
  NODE_CONTROL_MODEL_CHIP_CLASS,
  NODE_CONTROL_PARAMS_CHIP_CLASS,
} from '@/features/canvas/ui/nodeControlStyles';
import {
  buildVideoGenerationParamFields,
  getVideoGenerationModelDisplayParts,
} from '@/features/canvas/nodes/param-config/videoGenerationParams';

type VideoGenNodeProps = NodeProps & {
  id: string;
  data: VideoGenNodeData;
  selected?: boolean;
};

const VIDEO_GEN_NODE_MIN_WIDTH = 430;
const VIDEO_GEN_NODE_MIN_HEIGHT = 360;
const VIDEO_GEN_NODE_DEFAULT_WIDTH = 460;
const VIDEO_GEN_NODE_DEFAULT_HEIGHT = 280;
const VIDEO_INPUT_SLOT_SIZE = 76;
const VIDEO_TERMINAL_TASK_STATUSES = new Set(['succeed', 'failed', 'abandoned']);

function findInputImageByHandle(
  nodeId: string,
  handleId: string,
  nodes: CanvasNode[],
  edges: CanvasEdge[]
): string | null {
  const sourceNodeId = edges.find(
    (edge) => edge.target === nodeId && edge.targetHandle === handleId
  )?.source;
  if (!sourceNodeId) {
    return null;
  }
  const sourceNode = nodes.find((node) => node.id === sourceNodeId);
  return getNodePrimaryImageUrl(sourceNode ?? null);
}

export const VideoGenNode = memo(({ id, data, selected, width, height }: VideoGenNodeProps) => {
  const { t } = useTranslation();
  const updateNodeInternals = useUpdateNodeInternals();
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const kling = useSettingsStore((state) => state.kling);
  const apiKeys = useSettingsStore((state) => state.apiKeys);
  const maxConcurrent = useSettingsStore((state) => state.videoConcurrency.maxConcurrent);
  const llmModelId = useCopilotStore((state) => state.llmModelId);
  const videoModels = useMemo(() => listVideoModels(), []);
  const currentModel = useMemo(() => getVideoModel(data.modelId), [data.modelId]);
  const resolvedTitle = useMemo(
    () => resolveNodeDisplayName(CANVAS_NODE_TYPES.videoGen, data),
    [data]
  );
  const inputSlotStates = useMemo(
    () =>
      currentModel.inputSlots.map((slot) => {
        const imageRef = findInputImageByHandle(id, slot.handleId, nodes, edges);
        return {
          ...slot,
          imageRef,
          displayUrl: imageRef ? resolveImageDisplayUrl(imageRef) : null,
        };
      }),
    [currentModel.inputSlots, edges, id, nodes]
  );
  const firstFrameSlot = useMemo(
    () => inputSlotStates.find((slot) => slot.handleId === 'image-first-frame') ?? null,
    [inputSlotStates]
  );
  const tailFrameSlot = useMemo(
    () => inputSlotStates.find((slot) => slot.handleId === 'image-tail-frame') ?? null,
    [inputSlotStates]
  );
  const effectiveExtraParams = useMemo(
    () => ({
      ...(currentModel.defaultExtraParams ?? {}),
      ...(data.extraParams ?? {}),
    }),
    [currentModel.defaultExtraParams, data.extraParams]
  );
  const resolvedWidth = Math.max(VIDEO_GEN_NODE_MIN_WIDTH, Math.round(width ?? VIDEO_GEN_NODE_DEFAULT_WIDTH));
  const resolvedHeight = Math.max(VIDEO_GEN_NODE_MIN_HEIGHT, Math.round(height ?? VIDEO_GEN_NODE_DEFAULT_HEIGHT));
  const [localError, setLocalError] = useState<string | null>(null);
  const [isAiModelChoiceEnabled, setIsAiModelChoiceEnabled] = useState(false);
  const [isChoosingModel, setIsChoosingModel] = useState(false);
  const [isRunningArena, setIsRunningArena] = useState(false);
  const [modelChoiceReason, setModelChoiceReason] = useState<string | null>(null);
  const missingRequiredSlot = useMemo(
    () => inputSlotStates.find((slot) => slot.required && !slot.imageRef) ?? null,
    [inputSlotStates]
  );

  useEffect(() => {
    updateNodeInternals(id);
  }, [currentModel.inputSlots, id, resolvedHeight, resolvedWidth, updateNodeInternals]);

  const isBusy = Boolean(
    data.currentBatch?.subTasks?.some((subTask) =>
      ['pending', 'submitted', 'processing'].includes(subTask.status)
    ) ?? ['pending', 'submitted', 'processing'].includes(data.currentTask?.status ?? '')
  );
  const batchSummary = useMemo(() => {
    const subTasks = data.currentBatch?.subTasks ?? [];
    if (subTasks.length === 0) {
      return null;
    }
    return {
      completed: subTasks.filter((subTask) =>
        ['succeed', 'failed', 'abandoned'].includes(subTask.status)
      ).length,
      processing: subTasks.filter((subTask) => subTask.status === 'processing').length,
      waiting: subTasks.filter((subTask) =>
        ['pending', 'submitted'].includes(subTask.status)
      ).length,
      total: subTasks.length,
    };
  }, [data.currentBatch?.subTasks]);
  const activeTaskCount = useMemo(
    () =>
      nodes.filter((node) => {
        if (!isVideoGenNode(node) || node.id === id) {
          return false;
        }
        return ['pending', 'submitted', 'processing'].includes(node.data.currentTask?.status ?? '');
      }).length,
    [id, nodes]
  );
  const isConcurrencyLimited = activeTaskCount >= maxConcurrent;
  const isActionBusy = isBusy || isRunningArena;
  const paramFields = useMemo(
    () => buildVideoGenerationParamFields({
      t,
      selectedModel: currentModel,
      duration: data.duration,
      aspectRatio: data.aspectRatio,
      outputCount: data.outputCount,
      extraParams: data.extraParams,
    }),
    [currentModel, data.aspectRatio, data.duration, data.extraParams, data.outputCount, t]
  );

  const submitTask = useCallback(async () => {
    setLocalError(null);
    if (missingRequiredSlot) {
      setLocalError(
        missingRequiredSlot.handleId === 'image-first-frame'
          ? t('node.videoGeneration.noSourceImage')
          : `${missingRequiredSlot.label} is required.`
      );
      return;
    }
    if (!data.prompt.trim()) {
      setLocalError(t('node.videoGeneration.promptRequired'));
      return;
    }
    if (!kling.enabled || !kling.accessKey?.trim() || !kling.secretKey?.trim()) {
      setLocalError(t('node.videoGeneration.noApiKey'));
      return;
    }
    if (isConcurrencyLimited) {
      setLocalError(`当前视频并发上限为 ${maxConcurrent}，请等待其他任务完成后再提交`);
      return;
    }

    updateNodeData(id, {
      currentTask: {
        taskId: '',
        status: 'pending',
        progress: 0,
        submittedAt: Date.now(),
      },
    });

    try {
      const batchId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const response = await canvasAiGateway.submitVideoBatch({
        nodeId: id,
        batchId,
        modelId: data.modelId,
        prompt: data.prompt.trim(),
        negativePrompt: data.negativePrompt?.trim() || undefined,
        duration: data.duration,
        aspectRatio: data.aspectRatio,
        extraParams: effectiveExtraParams,
        providerConfig: currentModel.providerConfig,
        firstFrameRef: firstFrameSlot?.imageRef ?? '',
        tailFrameRef: tailFrameSlot?.imageRef ?? undefined,
        outputCount: data.outputCount || 1,
        accessKey: kling.accessKey.trim(),
        secretKey: kling.secretKey.trim(),
      });
      updateNodeData(id, {
        currentBatch: {
          batchId: response.batchId,
          submittedAt: Date.now(),
          subTasks: response.subTasks.map((subTask) => ({
            subTaskId: subTask.subTaskId,
            variantId: subTask.variantId,
            klingTaskId: subTask.klingTaskId,
            status: 'submitted',
            progress: 10,
          })),
        },
        currentTask: {
          taskId: response.subTasks[0]?.klingTaskId ?? '',
          status: 'submitted',
          progress: 10,
          submittedAt: Date.now(),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : t('node.videoGeneration.submitFailed');
      setLocalError(message);
      updateNodeData(id, {
        currentTask: {
          taskId: '',
          status: 'failed',
          progress: 0,
          errorMessage: message,
          submittedAt: Date.now(),
        },
      });
    }
  }, [
    data.aspectRatio,
    data.duration,
    data.extraParams,
    data.modelId,
    data.negativePrompt,
    data.prompt,
    currentModel.providerConfig,
    effectiveExtraParams,
    firstFrameSlot?.imageRef,
    id,
    kling.accessKey,
    kling.enabled,
    kling.secretKey,
    isConcurrencyLimited,
    maxConcurrent,
    missingRequiredSlot,
    t,
    tailFrameSlot?.imageRef,
    updateNodeData,
  ]);

  const buildModelSnapshotParams = useCallback((modelId: string) => {
    const model = getVideoModel(modelId);
    const duration = model.supportedDurations.includes(data.duration)
      ? data.duration
      : model.supportedDurations[0] ?? data.duration;
    const aspectRatio = model.supportedAspectRatios.includes(data.aspectRatio)
      ? data.aspectRatio
      : model.defaultAspectRatio;
    const extraParams = {
      ...(model.defaultExtraParams ?? {}),
      ...(data.extraParams ?? {}),
    };
    if (
      typeof extraParams.mode === 'string'
      && !model.supportedModes.includes(extraParams.mode as 'std' | 'pro')
    ) {
      const defaultMode = model.defaultExtraParams?.mode;
      if (typeof defaultMode === 'string' && model.supportedModes.includes(defaultMode as 'std' | 'pro')) {
        extraParams.mode = defaultMode;
      } else {
        delete extraParams.mode;
      }
    }

    return {
      model,
      snapshotParams: {
        modelId: model.id,
        prompt: data.prompt.trim(),
        negativePrompt: data.negativePrompt?.trim() || undefined,
        duration,
        aspectRatio,
        extraParams,
        firstFrameRef: firstFrameSlot?.imageRef ?? '',
        tailFrameRef: tailFrameSlot?.imageRef ?? undefined,
      },
    };
  }, [
    data.aspectRatio,
    data.duration,
    data.extraParams,
    data.negativePrompt,
    data.prompt,
    firstFrameSlot?.imageRef,
    tailFrameSlot?.imageRef,
  ]);

  const runModelArena = useCallback(async () => {
    if (isActionBusy) {
      return;
    }
    setLocalError(null);
    if (missingRequiredSlot) {
      setLocalError(
        missingRequiredSlot.handleId === 'image-first-frame'
          ? t('node.videoGeneration.noSourceImage')
          : `${missingRequiredSlot.label} is required.`
      );
      return;
    }
    if (!data.prompt.trim()) {
      setLocalError(t('node.videoGeneration.promptRequired'));
      return;
    }
    if (!kling.enabled || !kling.accessKey?.trim() || !kling.secretKey?.trim()) {
      setLocalError(t('node.videoGeneration.noApiKey'));
      return;
    }

    const batchId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const submittedAt = Date.now();
    setIsRunningArena(true);
    updateNodeData(id, {
      currentTask: {
        taskId: '',
        status: 'pending',
        progress: 0,
        submittedAt,
      },
    });

    try {
      const arenaSubTasks: NonNullable<VideoGenNodeData['currentBatch']>['subTasks'] = [];
      for (const model of videoModels) {
        const { snapshotParams } = buildModelSnapshotParams(model.id);
        try {
          const response = await canvasAiGateway.submitVideoBatch({
            nodeId: id,
            batchId,
            modelId: model.id,
            prompt: snapshotParams.prompt,
            negativePrompt: snapshotParams.negativePrompt,
            duration: snapshotParams.duration,
            aspectRatio: snapshotParams.aspectRatio,
            extraParams: snapshotParams.extraParams,
            providerConfig: model.providerConfig,
            firstFrameRef: snapshotParams.firstFrameRef,
            tailFrameRef: snapshotParams.tailFrameRef,
            outputCount: 1,
            accessKey: kling.accessKey.trim(),
            secretKey: kling.secretKey.trim(),
          });
          arenaSubTasks.push(...response.subTasks.map((subTask) => ({
            subTaskId: subTask.subTaskId,
            variantId: subTask.variantId,
            klingTaskId: subTask.klingTaskId,
            status: 'submitted' as const,
            progress: 10,
            snapshotParams,
          })));
        } catch (error) {
          const message = error instanceof Error ? error.message : t('node.videoGen.modelArenaSubmitFailed');
          const localId = globalThis.crypto?.randomUUID?.() ?? `${model.id}-${Date.now()}`;
          arenaSubTasks.push({
            subTaskId: localId,
            variantId: localId,
            status: 'failed',
            progress: 0,
            errorMessage: `${model.displayName}: ${message}`,
            snapshotParams,
          });
        }
      }

      const submittedSubTask = arenaSubTasks.find((subTask) => !VIDEO_TERMINAL_TASK_STATUSES.has(subTask.status));
      if (!submittedSubTask) {
        updateNodeData(id, {
          currentBatch: undefined,
          currentTask: {
            taskId: '',
            status: 'failed',
            progress: 0,
            errorMessage: t('node.videoGen.modelArenaSubmitFailed'),
            submittedAt,
          },
        });
        return;
      }

      updateNodeData(id, {
        currentBatch: {
          batchId,
          submittedAt,
          subTasks: arenaSubTasks,
        },
        currentTask: {
          taskId: submittedSubTask.klingTaskId ?? '',
          status: 'submitted',
          progress: 10,
          submittedAt,
        },
      });

      if (arenaSubTasks.some((subTask) => subTask.status === 'failed')) {
        setLocalError(t('node.videoGen.modelArenaPartialFailed'));
      }
    } finally {
      setIsRunningArena(false);
    }
  }, [
    buildModelSnapshotParams,
    data.prompt,
    id,
    isActionBusy,
    kling.accessKey,
    kling.enabled,
    kling.secretKey,
    missingRequiredSlot,
    t,
    updateNodeData,
    videoModels,
  ]);

  const chooseModelWithLlm = useCallback(async () => {
    if (isChoosingModel) {
      return;
    }

    const llmModel = getLlmModel(llmModelId || DEFAULT_LLM_MODEL_ID);
    const apiKey = apiKeys[llmModel.providerId]?.trim();
    if (!apiKey) {
      setLocalError(t('node.videoGen.aiChooseModelNoKey', { provider: llmModel.displayName }));
      return;
    }

    setIsChoosingModel(true);
    setLocalError(null);
    setModelChoiceReason(null);
    try {
      const choice = await chooseVideoModel({
        prompt: data.prompt.trim(),
        negativePrompt: data.negativePrompt?.trim() || undefined,
        currentModelId: data.modelId,
        hasFirstFrame: Boolean(firstFrameSlot?.imageRef),
        hasTailFrame: Boolean(tailFrameSlot?.imageRef),
        models: videoModels,
        llm: {
          model: llmModel.id,
          apiKey,
          providerBaseUrl: llmModel.baseUrl,
        },
      });
      const nextModel = videoModels.find((model) => model.id === choice.modelId) ?? currentModel;

      updateNodeData(id, {
        modelId: nextModel.id,
      });
      setModelChoiceReason(choice.reason ?? null);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('node.videoGen.aiChooseModelFailed');
      setLocalError(`${t('node.videoGen.aiChooseModelFailed')}: ${message}`);
    } finally {
      setIsChoosingModel(false);
    }
  }, [
    apiKeys,
    currentModel,
    data.modelId,
    data.negativePrompt,
    data.prompt,
    firstFrameSlot?.imageRef,
    id,
    isChoosingModel,
    llmModelId,
    t,
    tailFrameSlot?.imageRef,
    updateNodeData,
    videoModels,
  ]);

  const handleAiModelChoiceChange = useCallback((enabled: boolean) => {
    setIsAiModelChoiceEnabled(enabled);
    if (enabled) {
      void chooseModelWithLlm();
    }
  }, [chooseModelWithLlm]);

  const abandonTask = useCallback(async () => {
    if (!data.currentBatch?.batchId) {
      return;
    }
    try {
      await canvasAiGateway.cancelVideoBatch({
        nodeId: id,
        batchId: data.currentBatch.batchId,
      });
    } catch {
      // Local state should still reflect abandoned wait even if backend isn't fully wired yet.
    }
    updateNodeData(id, {
      currentBatch: {
        ...data.currentBatch,
        subTasks: data.currentBatch.subTasks.map((subTask) => ({
          ...subTask,
          status: ['succeed', 'failed'].includes(subTask.status) ? subTask.status : 'abandoned',
          progress: ['succeed', 'failed'].includes(subTask.status) ? subTask.progress : 0,
        })),
      },
      currentTask: {
        ...(data.currentTask ?? {
          taskId: '',
          submittedAt: Date.now(),
        }),
        status: 'abandoned',
        progress: 0,
      },
    });
  }, [data.currentBatch, data.currentTask, id, updateNodeData]);

  const generateButtonTitle = missingRequiredSlot
    ? missingRequiredSlot.handleId === 'image-first-frame'
      ? t('node.videoGen.firstFrameRequiredTip')
      : `${missingRequiredSlot.label} required`
    : isConcurrencyLimited
      ? t('node.videoGen.concurrencyLimitTip', { count: maxConcurrent })
      : undefined;

  const renderInputSlot = (
    handleId: string,
    label: string,
    emptyLabel: string,
    imageUrl: string | null
  ) => (
    <div className="relative flex flex-1 items-center gap-2 rounded-lg border border-[rgba(255,255,255,0.08)] bg-bg-dark/55 p-2">
      <MagneticHandle
        type="target"
        id={handleId}
        position={Position.Left}
        style={{ top: '50%' }}
        className="!left-[-6px] !h-2 !w-2 !border-surface-dark !bg-accent"
      />
      <div
        className="flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-[rgba(255,255,255,0.1)] bg-bg-dark/70"
        style={{ width: `${VIDEO_INPUT_SLOT_SIZE}px`, height: `${VIDEO_INPUT_SLOT_SIZE}px` }}
      >
        {imageUrl ? (
          <img src={imageUrl} alt={label} className="h-full w-full object-cover" />
        ) : (
          <ImageIcon className="h-5 w-5 text-text-muted/70" />
        )}
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-medium text-text-dark">{label}</div>
        <div className="text-[10px] text-text-muted">{imageUrl ? label : emptyLabel}</div>
      </div>
    </div>
  );

  return (
    <div
      className={`
        group relative flex h-full flex-col overflow-visible rounded-[var(--node-radius)] border bg-surface-dark/90 p-2 transition-colors duration-150
        ${selected
          ? 'border-accent shadow-[0_0_0_1px_rgba(59,130,246,0.32)]'
          : 'border-[rgba(15,23,42,0.22)] hover:border-[rgba(15,23,42,0.34)] dark:border-[rgba(255,255,255,0.22)] dark:hover:border-[rgba(255,255,255,0.34)]'}
      `}
      style={{ width: `${resolvedWidth}px`, height: `${resolvedHeight}px` }}
      onClick={() => setSelectedNode(id)}
    >
      <NodeHeader
        className={NODE_HEADER_FLOATING_POSITION_CLASS}
        icon={<Clapperboard className="h-4 w-4" />}
        titleText={resolvedTitle}
        subtitle={
          data.derivedFrom
            ? (
              <button
                type="button"
                className="pointer-events-auto text-[10px] text-text-muted transition-colors hover:text-text-dark"
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedNode(data.derivedFrom?.sourceResultNodeId ?? null);
                }}
              >
                {t('node.result.derivedFrom', { index: (data.derivedFrom.derivedFromVariantIndex ?? 0) + 1 })}
              </button>
            )
            : undefined
        }
        editable
        onTitleChange={(nextTitle) => updateNodeData(id, { displayName: nextTitle })}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-2 rounded-lg border border-[rgba(255,255,255,0.08)] bg-bg-dark/35 p-2">
        {inputSlotStates.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {inputSlotStates.map((slot) =>
              renderInputSlot(
                slot.handleId,
                slot.labelKey ? t(slot.labelKey) : slot.label,
                slot.emptyLabelKey ? t(slot.emptyLabelKey) : slot.emptyLabel,
                slot.displayUrl
              )
            )}
          </div>
        ) : null}

        {data.currentTask ? (
          <div className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-bg-dark/60 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs text-text-dark">
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
              <span>
                {batchSummary
                  ? t('node.videoGen.batchProgress', {
                    completed: batchSummary.completed,
                    total: batchSummary.total,
                    processing: batchSummary.processing,
                    waiting: batchSummary.waiting,
                  })
                  : t(`node.videoGen.status.${data.currentTask.status}`)}
              </span>
              <span className="ml-auto text-text-muted">
                {t('node.videoGen.generatedCount', { count: data.generatedResultNodeIds.length })}
              </span>
            </div>
            {batchSummary ? (
              <div className="text-[11px] text-text-muted">
                {t('node.videoGen.batchStatusLine', {
                  completed: batchSummary.completed,
                  total: batchSummary.total,
                  processing: batchSummary.processing,
                  waiting: batchSummary.waiting,
                })}
              </div>
            ) : null}
          </div>
        ) : null}

        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted/70">
            {t('node.videoGeneration.prompt')}
          </span>
          <textarea
            value={data.prompt}
            onChange={(event) => updateNodeData(id, { prompt: event.target.value })}
            onMouseDown={(event) => event.stopPropagation()}
            placeholder={t('node.videoGeneration.promptPlaceholder')}
            rows={4}
            className="nodrag nowheel w-full resize-none rounded border border-[rgba(255,255,255,0.1)] bg-bg-dark/60 px-2 py-1.5 text-[11px] leading-5 text-text-dark placeholder:text-text-muted/50 focus:border-accent/50 focus:outline-none"
          />
          <span className="text-[10px] text-text-muted">{data.prompt.length}/{currentModel.maxPromptLength}</span>
        </label>

        {(localError || data.currentTask?.errorMessage) ? (
          <div className="rounded border border-red-500/35 bg-red-500/10 px-2 py-1 text-[10px] text-red-200">
            {localError || data.currentTask?.errorMessage}
          </div>
        ) : null}
        {!isBusy && isConcurrencyLimited ? (
          <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-100">
            {`当前已有 ${activeTaskCount} 个视频任务在执行，达到并发上限 ${maxConcurrent}`}
          </div>
        ) : null}

        <div className="mt-auto flex items-center gap-2">
          <ModelParamsControls
            models={videoModels}
            selectedModel={currentModel}
            getModelDisplayParts={getVideoGenerationModelDisplayParts}
            onModelChange={(modelId) => {
              const nextModel = getVideoModel(modelId);
              updateNodeData(id, {
                modelId,
                duration: nextModel.supportedDurations[0] ?? 5,
                aspectRatio: (nextModel.supportedAspectRatios[0] ?? '16:9') as VideoGenNodeData['aspectRatio'],
                extraParams: { ...(nextModel.defaultExtraParams ?? {}) },
              });
            }}
            modelPanelToolbar={
              <div className="space-y-1.5">
                <button
                  type="button"
                  className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs transition-colors ${isAiModelChoiceEnabled
                    ? 'border-accent/35 bg-accent/10 text-text-dark'
                    : 'border-[rgba(255,255,255,0.1)] bg-bg-dark/65 text-text-muted hover:border-[rgba(255,255,255,0.2)]'
                    }`}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleAiModelChoiceChange(!isAiModelChoiceEnabled);
                  }}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {isChoosingModel ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-accent" />
                    ) : (
                      <Sparkles className={`h-3.5 w-3.5 shrink-0 ${isAiModelChoiceEnabled ? 'text-accent' : 'text-text-muted'}`} />
                    )}
                    <span className="truncate">{t('node.videoGen.aiModelChoice')}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className={`text-[10px] ${isAiModelChoiceEnabled ? 'text-accent' : 'text-text-muted'}`}>
                      {isChoosingModel
                        ? t('node.videoGen.aiChoosingModel')
                        : isAiModelChoiceEnabled
                          ? t('node.videoGen.enabled')
                          : t('node.videoGen.disabled')}
                    </span>
                    <UiSwitch
                      checked={isAiModelChoiceEnabled}
                      disabled={isChoosingModel}
                      onCheckedChange={handleAiModelChoiceChange}
                      aria-label={t('node.videoGen.aiModelChoice')}
                      onClick={(event) => event.stopPropagation()}
                    />
                  </span>
                </button>
                <button
                  type="button"
                  disabled={isActionBusy || Boolean(missingRequiredSlot)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-[rgba(255,255,255,0.14)] bg-bg-dark/65 px-3 py-2 text-xs font-medium text-text-dark transition-colors hover:bg-[rgba(255,255,255,0.06)] disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={(event) => {
                    event.stopPropagation();
                    void runModelArena();
                  }}
                >
                  {isRunningArena ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Swords className="h-3.5 w-3.5" />}
                  <span>{isRunningArena ? t('node.videoGen.modelArenaRunning') : t('node.videoGen.modelArena')}</span>
                </button>
                {modelChoiceReason ? (
                  <div className="line-clamp-2 text-[10px] leading-4 text-text-muted">
                    {t('node.videoGen.aiChooseModelReason', { reason: modelChoiceReason })}
                  </div>
                ) : null}
              </div>
            }
            paramFields={paramFields}
            onParamChange={(key, value) => {
              if (key === 'duration') {
                updateNodeData(id, { duration: Number(value) });
                return;
              }
              if (key === 'aspectRatio') {
                updateNodeData(id, { aspectRatio: String(value) as VideoGenNodeData['aspectRatio'] });
                return;
              }
              if (key === 'outputCount') {
                updateNodeData(id, { outputCount: Number(value) });
                return;
              }
              updateNodeData(id, {
                extraParams: {
                  ...(data.extraParams ?? {}),
                  [key]: value,
                },
              });
            }}
            onSubmit={() => void submitTask()}
            submitDisabled={isActionBusy || isConcurrencyLimited || Boolean(missingRequiredSlot)}
            submitVariant="circle"
            submitTitle={generateButtonTitle}
            triggerSize="sm"
            chipClassName={NODE_CONTROL_CHIP_CLASS}
            modelChipClassName={NODE_CONTROL_MODEL_CHIP_CLASS}
            paramsChipClassName={NODE_CONTROL_PARAMS_CHIP_CLASS}
            className="min-w-0 flex-1"
          />
          {data.currentTask ? (
            <UiButton
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void abandonTask();
              }}
              variant="muted"
              size="sm"
              className="shrink-0 !h-6 !rounded-md !px-2 !text-[11px]"
            >
              {t('node.videoGen.abandon')}
            </UiButton>
          ) : null}
        </div>
      </div>

      <MagneticHandle
        type="source"
        id="result-output"
        position={Position.Right}
        className="!h-2 !w-2 !border-surface-dark !bg-accent"
      />
      <NodeResizeHandle
        minWidth={VIDEO_GEN_NODE_MIN_WIDTH}
        minHeight={VIDEO_GEN_NODE_MIN_HEIGHT}
        maxWidth={1200}
        maxHeight={1000}
      />
    </div>
  );
});

VideoGenNode.displayName = 'VideoGenNode';
