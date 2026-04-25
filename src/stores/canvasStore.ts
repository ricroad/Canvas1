import { create } from 'zustand';
import {
  Connection,
  EdgeChange,
  NodeChange,
  type Viewport,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
} from '@xyflow/react';

import {
  CANVAS_NODE_TYPES,
  DEFAULT_ASPECT_RATIO,
  DEFAULT_NODE_WIDTH,
  EXPORT_RESULT_NODE_DEFAULT_WIDTH,
  EXPORT_RESULT_NODE_LAYOUT_HEIGHT,
  EXPORT_RESULT_NODE_MIN_HEIGHT,
  EXPORT_RESULT_NODE_MIN_WIDTH,
  getNodePrimaryImageUrl,
  isDiscardedCanvasNodeType,
  type ActiveToolDialog,
  type CanvasEdge,
  type CanvasNode,
  type CanvasNodeData,
  type CanvasNodeType,
  type DerivedFromMeta,
  type ExportImageNodeResultKind,
  type ImageEditNodeData,
  type ImageEditStackItem,
  type ImageResultNodeData,
  type ImageVariant,
  type NodeToolType,
  type StoryboardExportOptions,
  type StoryboardFrameItem,
  type VideoGenNodeData,
  type VideoResultNodeData,
  type VideoResultStackItem,
  type VideoVariant,
  isImageEditNode,
  isImageResultNode,
  isSceneComposerNode,
  isStoryboardSplitNode,
  isStoryboardGenNode,
  isVideoGenNode,
  isVideoResultNode,
} from '@/features/canvas/domain/canvasNodes';
import {
  nodeHasSourceHandle,
  nodeHasTargetHandle,
} from '@/features/canvas/domain/nodeRegistry';
import { EXPORT_RESULT_DISPLAY_NAME } from '@/features/canvas/domain/nodeDisplay';
import { nodeCatalog } from '@/features/canvas/application/nodeCatalog';
import { canvasNodeFactory } from '@/features/canvas/application/canvasServices';
import {
  ensureAtLeastOneMinEdge,
  resolveMinEdgeFittedSize,
  resolveSizeInsideTargetBox,
} from '@/features/canvas/application/imageNodeSizing';
import { useSettingsStore } from './settingsStore';

export type {
  ActiveToolDialog,
  CanvasEdge,
  CanvasNode,
  CanvasNodeData,
  CanvasNodeType,
  NodeToolType,
  StoryboardFrameItem,
};

export interface CanvasHistorySnapshot {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export interface CanvasHistoryState {
  past: CanvasHistorySnapshot[];
  future: CanvasHistorySnapshot[];
}

const MAX_HISTORY_STEPS = 50;
const IMAGE_NODE_VISUAL_MIN_EDGE = 96;
const VIDEO_RESULT_NODE_DEFAULT_WIDTH = 420;
const VIDEO_RESULT_NODE_DEFAULT_HEIGHT = 320;

function clampIndex(index: number, length: number): number {
  if (length <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(length - 1, index));
}

function normalizeSelectedIndices(indices: number[], length: number): number[] {
  return [...new Set(indices)]
    .filter((index) => Number.isInteger(index) && index >= 0 && index < length)
    .sort((left, right) => left - right);
}

function normalizeVideoVariant(candidate: VideoVariant): VideoVariant {
  return {
    variantId: candidate.variantId,
    klingTaskId: candidate.klingTaskId,
    klingVideoId: candidate.klingVideoId,
    videoRef: candidate.videoRef,
    thumbnailRef: candidate.thumbnailRef,
    videoDurationSeconds: candidate.videoDurationSeconds,
    generatedAt: candidate.generatedAt,
    snapshotParams: candidate.snapshotParams,
  };
}

function normalizeVideoResultStackItem(candidate: VideoResultStackItem): VideoResultStackItem {
  return normalizeVideoVariant(candidate);
}

function normalizeImageVariant(candidate: ImageVariant): ImageVariant {
  const legacyCandidate = candidate as ImageVariant & {
    imageRef?: string;
    generatedAt?: number;
  };
  return {
    variantId: candidate.variantId,
    imageUrl: candidate.imageUrl ?? legacyCandidate.imageRef ?? '',
    createdAt: candidate.createdAt ?? legacyCandidate.generatedAt ?? Date.now(),
  };
}

function syncImageResultResolvedFields(data: ImageResultNodeData): ImageResultNodeData {
  const variants = (Array.isArray(data.variants) ? data.variants : [])
    .filter((item): item is ImageVariant => Boolean(item?.imageUrl))
    .map((item) => normalizeImageVariant(item));
  const selectedVariantIndex = clampIndex(data.selectedVariantIndex ?? 0, variants.length);
  return {
    ...data,
    variants,
    selectedVariantIndex,
  };
}

function resolveManualConnectionSourceHandle(node: CanvasNode): string {
  if (isVideoResultNode(node)) {
    return 'video-output';
  }
  return 'source';
}

function resolveManualConnectionTargetHandle(type: CanvasNodeType): string {
  if (type === CANVAS_NODE_TYPES.videoGen) {
    return 'image-first-frame';
  }
  return 'target';
}

function resolveDerivedFromMeta(sourceNode: CanvasNode): DerivedFromMeta | undefined {
  if (isVideoResultNode(sourceNode)) {
    const selectedVariant =
      sourceNode.data.variants[sourceNode.data.selectedVariantIndex]
      ?? sourceNode.data.variants[0]
      ?? null;
    if (!selectedVariant) {
      return undefined;
    }
    return {
      sourceResultNodeId: sourceNode.id,
      derivedFromVariantIndex: sourceNode.data.selectedVariantIndex,
      derivedFromVariantId: selectedVariant.variantId,
      derivedAt: Date.now(),
    };
  }
  if (isImageResultNode(sourceNode)) {
    const selectedVariant =
      sourceNode.data.variants[sourceNode.data.selectedVariantIndex]
      ?? sourceNode.data.variants[0]
      ?? null;
    if (!selectedVariant) {
      return undefined;
    }
    return {
      sourceResultNodeId: sourceNode.id,
      derivedFromVariantIndex: sourceNode.data.selectedVariantIndex,
      derivedFromVariantId: selectedVariant.variantId,
      derivedAt: Date.now(),
    };
  }
  return undefined;
}

function nodeCanSourceResultBatch(node: CanvasNode, kind: 'video' | 'image'): boolean {
  if (kind === 'video') {
    return isVideoGenNode(node);
  }
  return isImageEditNode(node) || isStoryboardGenNode(node);
}

function resolveResultSequenceNumber(
  state: CanvasState,
  sourceGenNodeId: string,
  existingResultNodeId?: string | null
): number {
  const relatedResultNodes = state.nodes.filter((node) => {
    if (!isVideoResultNode(node) && !isImageResultNode(node)) {
      return false;
    }
    return node.data.sourceGenNodeId === sourceGenNodeId;
  });

  if (!existingResultNodeId) {
    return relatedResultNodes.length + 1;
  }

  const existingIndex = relatedResultNodes.findIndex((node) => node.id === existingResultNodeId);
  return existingIndex >= 0 ? existingIndex + 1 : relatedResultNodes.length + 1;
}

function syncImageEditResolvedFields(data: ImageEditNodeData): ImageEditNodeData {
  return {
    ...data,
    imageUrl: data.imageUrl ?? null,
    previewImageUrl: data.previewImageUrl ?? data.imageUrl ?? null,
    aspectRatio: data.aspectRatio ?? DEFAULT_ASPECT_RATIO,
    outputCount: Math.max(1, Math.min(4, Math.round(Number(data.outputCount ?? 1)))),
    generatedResultNodeIds: Array.isArray(data.generatedResultNodeIds)
      ? [...new Set(data.generatedResultNodeIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0))]
      : [],
    currentBatch: data.currentBatch
      ? {
        ...data.currentBatch,
        submittedAt: Number.isFinite(data.currentBatch.submittedAt)
          ? data.currentBatch.submittedAt
          : Date.now(),
        subTasks: Array.isArray(data.currentBatch.subTasks)
          ? data.currentBatch.subTasks.map((subTask, index) => ({
            subTaskId: subTask.subTaskId,
            variantId: subTask.variantId || `${data.currentBatch?.batchId ?? 'image-batch'}-variant-${index + 1}`,
            providerTaskId: subTask.providerTaskId,
            status: subTask.status,
            progress: Number.isFinite(subTask.progress) ? subTask.progress : 0,
            errorMessage: subTask.errorMessage,
            errorCode: subTask.errorCode,
            retryCount: Number.isFinite(subTask.retryCount) ? subTask.retryCount : 0,
          }))
          : [],
      }
      : undefined,
  };
}

function mergeImageVariants(existingVariants: ImageVariant[], incomingVariants: ImageVariant[]): ImageVariant[] {
  const merged = new Map<string, ImageVariant>();
  for (const variant of existingVariants) {
    const normalized = normalizeImageVariant(variant);
    merged.set(normalized.variantId, normalized);
  }
  for (const variant of incomingVariants) {
    const normalized = normalizeImageVariant(variant);
    merged.set(normalized.variantId, normalized);
  }
  return Array.from(merged.values()).sort((left, right) => left.createdAt - right.createdAt);
}

function syncVideoResultResolvedFields(data: VideoResultNodeData): VideoResultNodeData {
  const variants = (Array.isArray(data.variants) ? data.variants : [])
    .filter((item): item is VideoVariant => Boolean(item?.videoRef && item?.thumbnailRef))
    .map((item) => normalizeVideoVariant(item));
  const selectedVariantIndex = clampIndex(data.selectedVariantIndex ?? 0, variants.length);
  return {
    ...data,
    variants,
    selectedVariantIndex,
    stack: variants,
    activeIndex: selectedVariantIndex,
    pendingCandidates: null,
    candidateSelection: [],
  };
}

function deriveOrUpdateResultBatchNode(params: {
  state: CanvasState;
  sourceNode: CanvasNode;
  sourceGenNodeId: string;
  batchId: string;
  kind: 'video' | 'image';
  snapshotParams: VideoResultNodeData['snapshotParams'] | ImageResultNodeData['snapshotParams'];
  successfulVariants: VideoVariant[] | ImageVariant[];
  set: (
    partial:
      | Partial<CanvasState>
      | ((state: CanvasState) => Partial<CanvasState> | CanvasState)
  ) => void;
}): string | null {
  const {
    state,
    sourceNode,
    sourceGenNodeId,
    batchId,
    kind,
    snapshotParams,
    successfulVariants,
    set,
  } = params;
  if (!nodeCanSourceResultBatch(sourceNode, kind)) {
    return null;
  }

  if (successfulVariants.length === 0) {
    if (kind === 'image') {
      return null;
    }
    const nextNodes: CanvasNode[] = state.nodes.map((node) => {
      if (node.id !== sourceGenNodeId || !isVideoGenNode(node)) {
        return node;
      }
      return {
        ...node,
        data: {
          ...node.data,
          currentBatch: undefined,
          currentTask: {
            taskId: '',
            status: 'failed',
            progress: 0,
            errorMessage: 'This batch failed for all variants.',
            submittedAt: Date.now(),
          },
        },
      };
    });

    set({
      nodes: nextNodes,
      history: {
        past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
        future: [],
      },
      dragHistorySnapshot: null,
    });
    return null;
  }

  const existingResultNode = state.nodes.find(
    (node) =>
      (kind === 'video'
        ? isVideoResultNode(node)
        : node.type === CANVAS_NODE_TYPES.imageResult)
      && (node.data as VideoResultNodeData | ImageResultNodeData).batchId === batchId
  );
  const sequenceNumber = resolveResultSequenceNumber(state, sourceGenNodeId, existingResultNode?.id);
  const normalizedImageVariants = kind === 'image'
    ? (successfulVariants as ImageVariant[]).map((variant) => normalizeImageVariant(variant))
    : [];
  const normalizedVideoVariants = kind === 'video'
    ? (successfulVariants as VideoVariant[]).map((variant) => normalizeVideoVariant(variant))
    : [];

  const nextNodes = state.nodes.map((node) => {
    if (node.id === sourceGenNodeId && isVideoGenNode(node)) {
      return {
        ...node,
        data: {
          ...node.data,
          currentBatch: undefined,
          currentTask: undefined,
        },
      };
    }

    if (node.id === sourceGenNodeId && kind === 'image' && isImageEditNode(node)) {
      return {
        ...node,
        data: syncImageEditResolvedFields({
          ...node.data,
          generatedResultNodeIds: existingResultNode
            ? node.data.generatedResultNodeIds
            : node.data.generatedResultNodeIds,
        }),
      };
    }

    if (existingResultNode && node.id === existingResultNode.id) {
      if (kind === 'video' && isVideoResultNode(node)) {
        return {
          ...node,
          data: syncVideoResultResolvedFields({
            ...node.data,
            batchCreatedAt: Date.now(),
            snapshotParams: snapshotParams as VideoResultNodeData['snapshotParams'],
            variants: normalizedVideoVariants,
            selectedVariantIndex: 0,
          }),
        };
      }

      if (kind === 'image' && node.type === CANVAS_NODE_TYPES.imageResult) {
        const mergedVariants = mergeImageVariants(
          (node.data as ImageResultNodeData).variants ?? [],
          normalizedImageVariants
        );
        return {
          ...node,
          data: syncImageResultResolvedFields({
            ...(node.data as ImageResultNodeData),
            batchCreatedAt: Date.now(),
            snapshotParams: snapshotParams as ImageResultNodeData['snapshotParams'],
            variants: mergedVariants,
            selectedVariantIndex: clampIndex(
              (node.data as ImageResultNodeData).selectedVariantIndex ?? 0,
              mergedVariants.length
            ),
            isGenerating: false,
            generationStartedAt: null,
            generationJobId: null,
            generationProviderId: null,
            generationClientSessionId: null,
            generationStoryboardMetadata: undefined,
            generationError: null,
            generationErrorDetails: null,
            generationDebugContext: undefined,
          } as ImageResultNodeData),
        };
      }
    }

    return node;
  });

  let selectedNodeId = existingResultNode?.id ?? null;
  const nextEdges = [...state.edges];

  if (!existingResultNode) {
    const position = getVideoResultDerivedPosition(sourceNode, sequenceNumber);
    const resultNode = kind === 'video'
      ? canvasNodeFactory.createNode(
        CANVAS_NODE_TYPES.videoResult,
        position,
        syncVideoResultResolvedFields({
          displayName: `Video Clip #${sequenceNumber}`,
          sourceGenNodeId,
          batchId,
          batchCreatedAt: Date.now(),
          snapshotParams: snapshotParams as VideoResultNodeData['snapshotParams'],
          variants: normalizedVideoVariants,
          selectedVariantIndex: 0,
          stack: [],
          activeIndex: 0,
          pendingCandidates: null,
          candidateSelection: [],
        })
      )
      : canvasNodeFactory.createNode(CANVAS_NODE_TYPES.imageResult, position, {
        displayName: `Image Result #${sequenceNumber}`,
        sourceGenNodeId,
        batchId,
        batchCreatedAt: Date.now(),
        snapshotParams: snapshotParams as ImageResultNodeData['snapshotParams'],
        variants: normalizedImageVariants,
        selectedVariantIndex: 0,
      });
    resultNode.width = VIDEO_RESULT_NODE_DEFAULT_WIDTH;
    resultNode.height = VIDEO_RESULT_NODE_DEFAULT_HEIGHT;
    resultNode.style = {
      ...(resultNode.style ?? {}),
      width: VIDEO_RESULT_NODE_DEFAULT_WIDTH,
      height: VIDEO_RESULT_NODE_DEFAULT_HEIGHT,
    };
    selectedNodeId = resultNode.id;

    for (let index = 0; index < nextNodes.length; index += 1) {
      const node = nextNodes[index];
      if (node.id === sourceGenNodeId && isVideoGenNode(node)) {
        nextNodes[index] = {
          ...node,
          data: {
            ...node.data,
            generatedResultNodeIds: node.data.generatedResultNodeIds.includes(resultNode.id)
              ? node.data.generatedResultNodeIds
              : [...node.data.generatedResultNodeIds, resultNode.id],
            currentBatch: undefined,
            currentTask: undefined,
          },
        };
        break;
      }
      if (node.id === sourceGenNodeId && kind === 'image' && isImageEditNode(node)) {
        nextNodes[index] = {
          ...node,
          data: syncImageEditResolvedFields({
            ...node.data,
            generatedResultNodeIds: node.data.generatedResultNodeIds.includes(resultNode.id)
              ? node.data.generatedResultNodeIds
              : [...node.data.generatedResultNodeIds, resultNode.id],
          }),
        };
        break;
      }
    }

    nextEdges.push({
      id: `e-${sourceGenNodeId}-${resultNode.id}`,
      source: sourceGenNodeId,
      target: resultNode.id,
      sourceHandle: sourceNode.type === CANVAS_NODE_TYPES.videoGen ? 'result-output' : 'source',
      targetHandle: kind === 'video' ? 'gen-input' : 'target',
      type: 'disconnectableEdge',
    });
    nextNodes.push(resultNode);
  }

  set({
    nodes: nextNodes,
    edges: nextEdges,
    selectedNodeId,
    activeToolDialog: null,
    history: {
      past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
      future: [],
    },
    dragHistorySnapshot: null,
  });

  return selectedNodeId;
}

interface CanvasState {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  canvasToolMode: 'select' | 'pan';
  selectedNodeId: string | null;
  activeToolDialog: ActiveToolDialog | null;
  history: CanvasHistoryState;
  dragHistorySnapshot: CanvasHistorySnapshot | null;
  currentViewport: Viewport;
  canvasViewportSize: { width: number; height: number };
  imageViewer: {
    isOpen: boolean;
    currentImageUrl: string | null;
    imageList: string[];
    currentIndex: number;
  };

  onNodesChange: (changes: NodeChange<CanvasNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<CanvasEdge>[]) => void;
  onConnect: (connection: Connection) => void;

  setCanvasData: (nodes: CanvasNode[], edges: CanvasEdge[], history?: CanvasHistoryState) => void;
  addNode: (
    type: CanvasNodeType,
    position: { x: number; y: number },
    data?: Partial<CanvasNodeData>
  ) => string;
  addConnectedNode: (params: {
    sourceNodeId: string;
    targetType: CanvasNodeType;
  }) => string | null;
  duplicateAsNewShot: (nodeId: string) => string | null;
  addEdge: (source: string, target: string) => string | null;
  findNodePosition: (sourceNodeId: string, newNodeWidth: number, newNodeHeight: number) => { x: number; y: number };
  addDerivedUploadNode: (
    sourceNodeId: string,
    imageUrl: string,
    aspectRatio: string,
    previewImageUrl?: string
  ) => string | null;
  addDerivedExportNode: (
    sourceNodeId: string,
    imageUrl: string,
    aspectRatio: string,
    previewImageUrl?: string,
    options?: {
      defaultTitle?: string;
      resultKind?: ExportImageNodeResultKind;
      aspectRatioStrategy?: 'provided' | 'derivedFromSource';
      sizeStrategy?: 'generated' | 'autoMinEdge' | 'matchSource';
      matchSourceNodeSize?: boolean;
    }
  ) => string | null;
  addStoryboardSplitNode: (
    sourceNodeId: string,
    rows: number,
    cols: number,
    frames: StoryboardFrameItem[],
    frameAspectRatio?: string
  ) => string | null;
  deriveOrUpdateResultBatch: (params: {
    sourceGenNodeId: string;
    batchId: string;
    kind: 'video' | 'image';
    snapshotParams: VideoResultNodeData['snapshotParams'] | ImageResultNodeData['snapshotParams'];
    successfulVariants: VideoVariant[] | ImageVariant[];
  }) => string | null;
  selectVariant: (params: {
    resultNodeId: string;
    variantIndex: number;
  }) => boolean;
  deleteVariant: (params: {
    resultNodeId: string;
    variantIndex: number;
  }) => boolean;
  appendCandidatesToNode: (
    nodeId: string,
    candidates: ImageEditStackItem[] | VideoResultStackItem[]
  ) => boolean;
  adoptCandidates: (nodeId: string, selectedIndices: number[]) => boolean;
  discardAllCandidates: (nodeId: string) => boolean;
  setActiveIndex: (nodeId: string, index: number) => boolean;

  updateNodeData: (nodeId: string, data: Partial<CanvasNodeData>) => void;
  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => void;
  updateStoryboardFrame: (
    nodeId: string,
    frameId: string,
    data: Partial<StoryboardFrameItem>
  ) => void;
  reorderStoryboardFrame: (
    nodeId: string,
    draggedFrameId: string,
    targetFrameId: string
  ) => void;

  deleteNode: (nodeId: string) => void;
  deleteNodes: (nodeIds: string[]) => void;
  groupNodes: (nodeIds: string[]) => string | null;
  ungroupNode: (groupNodeId: string) => boolean;
  deleteEdge: (edgeId: string) => void;
  setSelectedNode: (nodeId: string | null) => void;
  setCanvasToolMode: (mode: 'select' | 'pan') => void;

  openToolDialog: (dialog: ActiveToolDialog) => void;
  closeToolDialog: () => void;
  setViewportState: (viewport: Viewport) => void;
  setCanvasViewportSize: (size: { width: number; height: number }) => void;
  openImageViewer: (imageUrl: string, imageList?: string[]) => void;
  closeImageViewer: () => void;
  navigateImageViewer: (direction: 'prev' | 'next') => void;

  undo: () => boolean;
  redo: () => boolean;

  clearCanvas: () => void;
}

function normalizeHandleId(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') {
    return undefined;
  }
  return trimmed;
}

function normalizeEdgesWithNodes(rawEdges: CanvasEdge[], nodes: CanvasNode[]): CanvasEdge[] {
  const nodeMap = new Map(nodes.map((node) => [node.id, node] as const));

  return rawEdges
    .filter((edge) => {
      const sourceNode = nodeMap.get(edge.source);
      const targetNode = nodeMap.get(edge.target);
      if (!sourceNode || !targetNode) {
        return false;
      }
      return nodeHasSourceHandle(sourceNode.type) && nodeHasTargetHandle(targetNode.type);
    })
    .map((edge) => ({
      ...edge,
      type: edge.type ?? 'disconnectableEdge',
      sourceHandle:
        normalizeHandleId((edge as CanvasEdge & { sourceHandle?: unknown }).sourceHandle) ?? 'source',
      targetHandle:
        normalizeHandleId((edge as CanvasEdge & { targetHandle?: unknown }).targetHandle) ?? 'target',
    }));
}

function normalizeNodes(rawNodes: CanvasNode[]): CanvasNode[] {
  return rawNodes
    .map((node) => {
      if (isDiscardedCanvasNodeType(node.type)) {
        return null;
      }

      if (!Object.values(CANVAS_NODE_TYPES).includes(node.type as CanvasNodeType)) {
        return null;
      }

      const definition = nodeCatalog.getDefinition(node.type as CanvasNodeType);
      const mergedData = {
        ...definition.createDefaultData(),
        ...(node.data as Partial<CanvasNodeData>),
      } as CanvasNodeData;

      if (node.type === CANVAS_NODE_TYPES.storyboardSplit) {
        const frames = (mergedData as { frames?: StoryboardFrameItem[] }).frames ?? [];
        const firstFrameAspectRatio = frames.find((frame) => typeof frame.aspectRatio === 'string')
          ?.aspectRatio;
        const normalizedFrameAspectRatio =
          (typeof (mergedData as { frameAspectRatio?: unknown }).frameAspectRatio === 'string'
            ? (mergedData as { frameAspectRatio?: string }).frameAspectRatio
            : null) ??
          firstFrameAspectRatio ??
          DEFAULT_ASPECT_RATIO;

        (mergedData as { frameAspectRatio: string }).frameAspectRatio = normalizedFrameAspectRatio;
        (mergedData as { frames: StoryboardFrameItem[] }).frames = frames.map((frame, index) => ({
          id: frame.id,
          imageUrl: frame.imageUrl ?? null,
          previewImageUrl: frame.previewImageUrl ?? null,
          aspectRatio:
            typeof frame.aspectRatio === 'string'
              ? frame.aspectRatio
              : normalizedFrameAspectRatio,
          note: frame.note ?? '',
          order: Number.isFinite(frame.order) ? frame.order : index,
        }));

        const rawExportOptions = (mergedData as { exportOptions?: Partial<StoryboardExportOptions> })
          .exportOptions;
        const rawFontSize = Number.isFinite(rawExportOptions?.fontSize)
          ? Number(rawExportOptions?.fontSize)
          : createDefaultStoryboardExportOptions().fontSize;
        const normalizedFontSize = rawFontSize > 20
          ? Math.round(rawFontSize / 6)
          : rawFontSize;
        (mergedData as { exportOptions: StoryboardExportOptions }).exportOptions = {
          ...createDefaultStoryboardExportOptions(),
          ...(rawExportOptions ?? {}),
          fontSize: Math.max(1, Math.min(20, Math.round(normalizedFontSize))),
        };
      }

      if ('aspectRatio' in mergedData && !mergedData.aspectRatio) {
        mergedData.aspectRatio = DEFAULT_ASPECT_RATIO;
      }

      // Keep generation state only when there is a recoverable job id or active image batch.
      if ('isGenerating' in mergedData && mergedData.isGenerating) {
        const generationJobId =
          typeof (mergedData as { generationJobId?: unknown }).generationJobId === 'string'
            ? (mergedData as { generationJobId?: string }).generationJobId?.trim() ?? ''
            : '';
        const hasActiveImageBatch = isImageEditNode({ ...node, data: mergedData } as CanvasNode)
          && Array.isArray((mergedData as ImageEditNodeData).currentBatch?.subTasks)
          && (mergedData as ImageEditNodeData).currentBatch!.subTasks.some((subTask) =>
            typeof subTask.providerTaskId === 'string'
            && subTask.providerTaskId.length > 0
            && ['pending', 'submitted', 'processing'].includes(subTask.status)
          );
        if (!generationJobId && !hasActiveImageBatch) {
          mergedData.isGenerating = false;
          if ('generationStartedAt' in mergedData) {
            mergedData.generationStartedAt = null;
          }
        }
      }

      if (isImageEditNode({ ...node, data: mergedData } as CanvasNode)) {
        const imageEditData = mergedData as ImageEditNodeData;
        imageEditData.outputCount = Math.max(
          1,
          Math.min(
            4,
            Math.round(
              Number(
                imageEditData.outputCount
                ?? (mergedData as { n?: unknown }).n
                ?? 4
              )
            )
          )
        );
        imageEditData.generatedResultNodeIds = Array.isArray(imageEditData.generatedResultNodeIds)
          ? imageEditData.generatedResultNodeIds.filter(
            (nodeId): nodeId is string => typeof nodeId === 'string' && nodeId.trim().length > 0
          )
          : [];
        const hasActiveBatch = imageEditData.currentBatch?.subTasks?.some((subTask) =>
          ['pending', 'submitted', 'processing'].includes(subTask.status)
        );
        if (hasActiveBatch && imageEditData.currentBatch) {
          imageEditData.currentBatch = {
            ...imageEditData.currentBatch,
            subTasks: imageEditData.currentBatch.subTasks.map((subTask) =>
              ['pending', 'submitted', 'processing'].includes(subTask.status)
                ? {
                  ...subTask,
                  status: 'failed',
                  progress: 0,
                  errorMessage: subTask.errorMessage || 'Image task was interrupted by app restart',
                }
                : subTask
            ),
          };
          imageEditData.isGenerating = false;
          imageEditData.generationStartedAt = null;
        }
        Object.assign(imageEditData, syncImageEditResolvedFields(imageEditData));
      }

      if (isVideoResultNode({ ...node, data: mergedData } as CanvasNode)) {
        const videoResultData = mergedData as VideoResultNodeData;
        const legacyVariant = (
          (Array.isArray(videoResultData.stack) ? videoResultData.stack : []) as VideoVariant[]
        )
          .filter((item): item is VideoVariant => Boolean(item?.videoRef && item?.thumbnailRef))
          .map((item) => normalizeVideoVariant(item));
        videoResultData.variants = (
          Array.isArray(videoResultData.variants) && videoResultData.variants.length > 0
            ? videoResultData.variants
            : legacyVariant
        )
          .filter((item): item is VideoVariant => Boolean(item?.videoRef && item?.thumbnailRef))
          .map((item) => normalizeVideoVariant(item));
        videoResultData.selectedVariantIndex = clampIndex(
          videoResultData.selectedVariantIndex ?? videoResultData.activeIndex ?? 0,
          videoResultData.variants.length
        );
        Object.assign(videoResultData, syncVideoResultResolvedFields(videoResultData));
      }

      if (isVideoGenNode({ ...node, data: mergedData } as CanvasNode)) {
        const videoGenData = mergedData as VideoGenNodeData;
        videoGenData.outputCount = Math.max(1, Math.min(4, Math.round(Number(videoGenData.outputCount ?? 1))));
        const hasActiveBatch = videoGenData.currentBatch?.subTasks?.some((subTask) =>
          ['pending', 'submitted', 'processing'].includes(subTask.status)
        );
        if (hasActiveBatch && videoGenData.currentBatch) {
          videoGenData.currentBatch = {
            ...videoGenData.currentBatch,
            subTasks: videoGenData.currentBatch.subTasks.map((subTask) =>
              ['pending', 'submitted', 'processing'].includes(subTask.status)
                ? {
                  ...subTask,
                  status: 'failed',
                  progress: 0,
                  errorMessage: subTask.errorMessage || 'Video task was interrupted by app restart',
                }
                : subTask
            ),
          };
          videoGenData.currentTask = {
            taskId: videoGenData.currentBatch.subTasks[0]?.klingTaskId ?? '',
            status: 'failed',
            progress: 0,
            errorMessage: 'Video task was interrupted by app restart',
            submittedAt: videoGenData.currentBatch.subTasks.length > 0
              ? (videoGenData.currentBatch.submittedAt ?? Date.now())
              : Date.now(),
          };
        }
      }

      return {
        ...node,
        type: node.type as CanvasNodeType,
        data: mergedData,
      };
    })
    .filter((node): node is CanvasNode => Boolean(node));
}

function normalizeHistory(history?: CanvasHistoryState): CanvasHistoryState {
  if (!history) {
    return { past: [], future: [] };
  }

  const normalizeSnapshot = (snapshot: CanvasHistorySnapshot): CanvasHistorySnapshot => {
    const normalizedNodes = normalizeNodes(snapshot.nodes);
    return {
      nodes: normalizedNodes,
      edges: normalizeEdgesWithNodes(snapshot.edges, normalizedNodes),
    };
  };

  return {
    past: history.past.slice(-MAX_HISTORY_STEPS).map(normalizeSnapshot),
    future: history.future.slice(-MAX_HISTORY_STEPS).map(normalizeSnapshot),
  };
}

function createSnapshot(nodes: CanvasNode[], edges: CanvasEdge[]): CanvasHistorySnapshot {
  return { nodes, edges };
}

function collectNodeIdsWithDescendants(nodes: CanvasNode[], seedIds: string[]): Set<string> {
  const deleteSet = new Set(seedIds);
  let changed = true;

  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (!node.parentId || deleteSet.has(node.id)) {
        continue;
      }
      if (deleteSet.has(node.parentId)) {
        deleteSet.add(node.id);
        changed = true;
      }
    }
  }

  return deleteSet;
}

function getNodeSize(node: CanvasNode): { width: number; height: number } {
  return {
    width:
      typeof node.measured?.width === 'number'
        ? node.measured.width
        : typeof node.width === 'number'
          ? node.width
          : DEFAULT_NODE_WIDTH,
    height:
      typeof node.measured?.height === 'number'
        ? node.measured.height
        : typeof node.height === 'number'
          ? node.height
          : 200,
  };
}

function isImageAutoResizableType(type: CanvasNodeType): boolean {
  return type === CANVAS_NODE_TYPES.upload
    || type === CANVAS_NODE_TYPES.imageEdit
    || type === CANVAS_NODE_TYPES.exportImage;
}

function withManualSizeLock(node: CanvasNode): CanvasNode {
  const nodeData = node.data as CanvasNodeData & { isSizeManuallyAdjusted?: boolean };
  if (nodeData.isSizeManuallyAdjusted) {
    return node;
  }

  return {
    ...node,
    data: {
      ...node.data,
      isSizeManuallyAdjusted: true,
    } as CanvasNodeData,
  };
}

function resolveAutoImageNodeDimensions(
  aspectRatio: string,
  options?: {
    minWidth?: number;
    minHeight?: number;
  }
): { width: number; height: number } {
  const minWidth = options?.minWidth ?? EXPORT_RESULT_NODE_MIN_WIDTH;
  const minHeight = options?.minHeight ?? EXPORT_RESULT_NODE_MIN_HEIGHT;
  return resolveMinEdgeFittedSize(aspectRatio, { minWidth, minHeight });
}

function resolveGeneratedImageNodeDimensions(
  aspectRatio: string,
  options?: {
    minWidth?: number;
    minHeight?: number;
  }
): { width: number; height: number } {
  const size = resolveSizeInsideTargetBox(aspectRatio, {
    width: EXPORT_RESULT_NODE_DEFAULT_WIDTH,
    height: EXPORT_RESULT_NODE_LAYOUT_HEIGHT,
  });
  const minWidth = options?.minWidth ?? IMAGE_NODE_VISUAL_MIN_EDGE;
  const minHeight = options?.minHeight ?? IMAGE_NODE_VISUAL_MIN_EDGE;

  return ensureAtLeastOneMinEdge(size, { minWidth, minHeight });
}

function resolveDerivedAspectRatio(
  sourceNode: CanvasNode | undefined,
  fallbackAspectRatio: string
): string {
  if (!sourceNode) {
    return fallbackAspectRatio;
  }

  if (sourceNode.type === CANVAS_NODE_TYPES.storyboardGen) {
    const data = sourceNode.data as { requestAspectRatio?: string; aspectRatio?: string };
    const preferred = data.requestAspectRatio && data.requestAspectRatio !== 'auto'
      ? data.requestAspectRatio
      : data.aspectRatio;
    return preferred || fallbackAspectRatio;
  }

  if (sourceNode.type === CANVAS_NODE_TYPES.storyboardSplit) {
    const data = sourceNode.data as { frameAspectRatio?: string; aspectRatio?: string };
    return data.frameAspectRatio || data.aspectRatio || fallbackAspectRatio;
  }

  if (sourceNode.type === CANVAS_NODE_TYPES.imageEdit) {
    const data = sourceNode.data as { requestAspectRatio?: string; aspectRatio?: string };
    const preferred = data.requestAspectRatio && data.requestAspectRatio !== 'auto'
      ? data.requestAspectRatio
      : data.aspectRatio;
    return preferred || fallbackAspectRatio;
  }

  const imageLikeAspect = (sourceNode.data as { aspectRatio?: string }).aspectRatio;
  return imageLikeAspect || fallbackAspectRatio;
}

function maybeApplyImageAutoResize(node: CanvasNode, patch: Partial<CanvasNodeData>): CanvasNode {
  if (!isImageAutoResizableType(node.type)) {
    return node;
  }

  const nodeData = node.data as CanvasNodeData & {
    imageUrl?: string | null;
    aspectRatio?: string;
    isSizeManuallyAdjusted?: boolean;
  };
  const patchData = patch as Partial<CanvasNodeData> & {
    imageUrl?: string | null;
    aspectRatio?: string;
    isSizeManuallyAdjusted?: boolean;
  };

  const hasImageRelatedChange = 'imageUrl' in patchData || 'previewImageUrl' in patchData || 'aspectRatio' in patchData;
  if (!hasImageRelatedChange) {
    return node;
  }

  const isSizeManuallyAdjusted = patchData.isSizeManuallyAdjusted ?? nodeData.isSizeManuallyAdjusted ?? false;
  if (isSizeManuallyAdjusted) {
    return node;
  }

  const nextImageUrl = patchData.imageUrl ?? nodeData.imageUrl;
  if (typeof nextImageUrl !== 'string' || nextImageUrl.trim().length === 0) {
    return node;
  }

  const nextAspectRatio = patchData.aspectRatio ?? nodeData.aspectRatio ?? DEFAULT_ASPECT_RATIO;
  const nextSize = node.type === CANVAS_NODE_TYPES.exportImage
    ? resolveAutoImageNodeDimensions(nextAspectRatio, {
      minWidth: EXPORT_RESULT_NODE_MIN_WIDTH,
      minHeight: EXPORT_RESULT_NODE_MIN_HEIGHT,
    })
    : resolveAutoImageNodeDimensions(nextAspectRatio);

  return {
    ...node,
    width: nextSize.width,
    height: nextSize.height,
    style: {
      ...(node.style ?? {}),
      width: nextSize.width,
      height: nextSize.height,
    },
  };
}

function resolveAbsolutePosition(
  node: CanvasNode,
  nodeMap: Map<string, CanvasNode>
): { x: number; y: number } {
  let x = node.position.x;
  let y = node.position.y;
  let currentParentId = node.parentId;
  const visited = new Set<string>();

  while (currentParentId && !visited.has(currentParentId)) {
    visited.add(currentParentId);
    const parent = nodeMap.get(currentParentId);
    if (!parent) {
      break;
    }
    x += parent.position.x;
    y += parent.position.y;
    currentParentId = parent.parentId;
  }

  return { x, y };
}

function pushSnapshot(
  snapshots: CanvasHistorySnapshot[],
  snapshot: CanvasHistorySnapshot
): CanvasHistorySnapshot[] {
  const last = snapshots[snapshots.length - 1];
  if (last && last.nodes === snapshot.nodes && last.edges === snapshot.edges) {
    return snapshots;
  }

  const next = [...snapshots, snapshot];
  if (next.length > MAX_HISTORY_STEPS) {
    next.shift();
  }
  return next;
}

function getDerivedNodePosition(nodes: CanvasNode[], sourceNodeId: string): { x: number; y: number } {
  const sourceNode = nodes.find((node) => node.id === sourceNodeId);
  if (!sourceNode) {
    return { x: 100, y: 100 };
  }

  return {
    x: sourceNode.position.x + DEFAULT_NODE_WIDTH + 100,
    y: sourceNode.position.y,
  };
}

function getVideoResultDerivedPosition(
  sourceNode: CanvasNode,
  sequenceNumber: number
): { x: number; y: number } {
  const sourceSize = getNodeSize(sourceNode);
  return {
    x: Math.round(sourceNode.position.x + sourceSize.width + 80),
    y: Math.round(sourceNode.position.y + (sequenceNumber - 1) * (VIDEO_RESULT_NODE_DEFAULT_HEIGHT + 24)),
  };
}

function resolveSelectedNodeId(selectedNodeId: string | null, nodes: CanvasNode[]): string | null {
  if (!selectedNodeId) {
    return null;
  }
  return nodes.some((node) => node.id === selectedNodeId) ? selectedNodeId : null;
}

function resolveActiveToolDialog(
  activeToolDialog: ActiveToolDialog | null,
  nodes: CanvasNode[]
): ActiveToolDialog | null {
  if (!activeToolDialog) {
    return null;
  }
  return nodes.some((node) => node.id === activeToolDialog.nodeId) ? activeToolDialog : null;
}

function createDefaultStoryboardExportOptions(): StoryboardExportOptions {
  return {
    showFrameIndex: false,
    showFrameNote: false,
    notePlacement: 'overlay',
    imageFit: 'cover',
    frameIndexPrefix: 'S',
    cellGap: 8,
    outerPadding: 0,
    fontSize: 4,
    backgroundColor: '#0f1115',
    textColor: '#f8fafc',
  };
}

function applyDefaultGenerationParams<TNode extends CanvasNode>(
  node: TNode,
  explicitData: Partial<CanvasNodeData> = {}
): TNode {
  const defaults = useSettingsStore.getState();
  const explicit = explicitData as Record<string, unknown>;

  if (isImageEditNode(node)) {
    return {
      ...node,
      data: syncImageEditResolvedFields({
        ...node.data,
        model: typeof explicit.model === 'string' ? node.data.model : defaults.defaultImageModelId,
        size: typeof explicit.size === 'string'
          ? node.data.size
          : (defaults.defaultImageSize as ImageEditNodeData['size']),
        requestAspectRatio: typeof explicit.requestAspectRatio === 'string'
          ? node.data.requestAspectRatio
          : defaults.defaultImageAspectRatio,
      }),
    };
  }

  if (isStoryboardGenNode(node)) {
    return {
      ...node,
      data: {
        ...node.data,
        model: typeof explicit.model === 'string' ? node.data.model : defaults.defaultImageModelId,
        size: typeof explicit.size === 'string'
          ? node.data.size
          : (defaults.defaultImageSize as ImageEditNodeData['size']),
        requestAspectRatio: typeof explicit.requestAspectRatio === 'string'
          ? node.data.requestAspectRatio
          : defaults.defaultImageAspectRatio,
      },
    };
  }

  return node;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: [],
  edges: [],
  canvasToolMode: 'pan',
  selectedNodeId: null,
  activeToolDialog: null,
  history: { past: [], future: [] },
  dragHistorySnapshot: null,
  currentViewport: { x: 0, y: 0, zoom: 1 },
  canvasViewportSize: { width: 0, height: 0 },
  imageViewer: {
    isOpen: false,
    currentImageUrl: null,
    imageList: [],
    currentIndex: 0,
  },

  onNodesChange: (changes) => {
    set((state) => {
      const resizedNodeIds = new Set(
        changes
          .filter(
            (change): change is NodeChange<CanvasNode> & { id: string } =>
              change.type === 'dimensions'
              && 'resizing' in change
              && change.resizing === false
              && typeof change.id === 'string'
          )
          .map((change) => change.id)
      );

      let nextNodes = applyNodeChanges<CanvasNode>(changes, state.nodes);
      if (resizedNodeIds.size > 0) {
        nextNodes = nextNodes.map((node) => {
          if (!resizedNodeIds.has(node.id) || !isImageAutoResizableType(node.type)) {
            return node;
          }
          return withManualSizeLock(node);
        });
      }
      const hasMeaningfulChange = changes.some((change) => change.type !== 'select');
      const hasDragMove = changes.some(
        (change) =>
          change.type === 'position' &&
          'dragging' in change &&
          Boolean(change.dragging)
      );
      const hasDragEnd = changes.some(
        (change) =>
          change.type === 'position' &&
          'dragging' in change &&
          change.dragging === false
      );
      const hasResizeMove = changes.some(
        (change) =>
          change.type === 'dimensions' &&
          'resizing' in change &&
          Boolean(change.resizing)
      );
      const hasResizeEnd = changes.some(
        (change) =>
          change.type === 'dimensions' &&
          'resizing' in change &&
          change.resizing === false
      );
      const hasInteractionMove = hasDragMove || hasResizeMove;
      const hasInteractionEnd = hasDragEnd || hasResizeEnd;

      let nextHistory = state.history;
      let nextDragHistorySnapshot = state.dragHistorySnapshot;

      if (hasInteractionMove && !nextDragHistorySnapshot) {
        nextDragHistorySnapshot = createSnapshot(state.nodes, state.edges);
      }

      if (hasInteractionEnd) {
        const snapshot = nextDragHistorySnapshot ?? createSnapshot(state.nodes, state.edges);
        nextHistory = {
          past: pushSnapshot(state.history.past, snapshot),
          future: [],
        };
        nextDragHistorySnapshot = null;
      } else if (hasMeaningfulChange && !hasInteractionMove) {
        nextHistory = {
          past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
          future: [],
        };
        nextDragHistorySnapshot = null;
      }

      return {
        nodes: nextNodes,
        selectedNodeId: resolveSelectedNodeId(state.selectedNodeId, nextNodes),
        activeToolDialog: resolveActiveToolDialog(state.activeToolDialog, nextNodes),
        history: nextHistory,
        dragHistorySnapshot: nextDragHistorySnapshot,
      };
    });
  },

  onEdgesChange: (changes) => {
    set((state) => {
      const nextEdges = applyEdgeChanges<CanvasEdge>(changes, state.edges);
      const hasMeaningfulChange = changes.some((change) => change.type !== 'select');

      if (!hasMeaningfulChange) {
        return { edges: nextEdges };
      }

      return {
        edges: nextEdges,
        history: {
          past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
          future: [],
        },
        dragHistorySnapshot: null,
      };
    });
  },

  onConnect: (connection) => {
    const sourceHandle = normalizeHandleId(connection.sourceHandle) ?? 'source';
    const targetHandle = normalizeHandleId(connection.targetHandle) ?? 'target';
    set((state) => {
      const nextEdges = addEdge<CanvasEdge>(
        { ...connection, sourceHandle, targetHandle, type: 'disconnectableEdge' },
        state.edges
      );

      const sourceNode = state.nodes.find((n) => n.id === connection.source);
      const targetNode = state.nodes.find((n) => n.id === connection.target);

      let nextNodes = state.nodes;
      const sourceImageUrl = getNodePrimaryImageUrl(sourceNode);

      // SceneComposer: accept any upstream image as reference input
      if (targetNode && isSceneComposerNode(targetNode) && sourceImageUrl) {
        nextNodes = state.nodes.map((n) => (n.id === targetNode.id
          ? { ...n, data: { ...n.data, inputImageUrl: sourceImageUrl } }
          : n));
      }

      return {
        nodes: nextNodes,
        edges: nextEdges,
        history: {
          past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
          future: [],
        },
        dragHistorySnapshot: null,
      };
    });
  },

  setCanvasData: (nodes, edges, history) => {
    const normalizedNodes = normalizeNodes(nodes);
    const normalizedEdges = normalizeEdgesWithNodes(edges, normalizedNodes);

    set({
      nodes: normalizedNodes,
      edges: normalizedEdges,
      selectedNodeId: null,
      activeToolDialog: null,
      history: normalizeHistory(history),
      dragHistorySnapshot: null,
    });
  },

  setViewportState: (viewport) => {
    set({ currentViewport: viewport });
  },

  setCanvasViewportSize: (size) => {
    set({ canvasViewportSize: size });
  },

  openImageViewer: (imageUrl, imageList = []) => {
    const list = imageList.length > 0 ? imageList : [imageUrl];
    const index = list.indexOf(imageUrl);
    set({
      imageViewer: {
        isOpen: true,
        currentImageUrl: imageUrl,
        imageList: list,
        currentIndex: index >= 0 ? index : 0,
      },
    });
  },

  closeImageViewer: () => {
    set({
      imageViewer: {
        isOpen: false,
        currentImageUrl: null,
        imageList: [],
        currentIndex: 0,
      },
    });
  },

  setCanvasToolMode: (mode) => {
    set((state) => (state.canvasToolMode === mode ? {} : { canvasToolMode: mode }));
  },

  navigateImageViewer: (direction) => {
    const state = get();
    const { currentIndex, imageList } = state.imageViewer;
    if (direction === 'prev' && currentIndex > 0) {
      const newIndex = currentIndex - 1;
      set({
        imageViewer: {
          ...state.imageViewer,
          currentIndex: newIndex,
          currentImageUrl: imageList[newIndex],
        },
      });
    } else if (direction === 'next' && currentIndex < imageList.length - 1) {
      const newIndex = currentIndex + 1;
      set({
        imageViewer: {
          ...state.imageViewer,
          currentIndex: newIndex,
          currentImageUrl: imageList[newIndex],
        },
      });
    }
  },

  addNode: (type, position, data = {}) => {
    const state = get();
    const newNode = applyDefaultGenerationParams(
      canvasNodeFactory.createNode(type, position, data),
      data
    );
    set({
      nodes: [...state.nodes, newNode],
      history: {
        past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
        future: [],
      },
      dragHistorySnapshot: null,
    });
    return newNode.id;
  },

  addConnectedNode: ({ sourceNodeId, targetType }) => {
    const state = get();
    const sourceNode = state.nodes.find((node) => node.id === sourceNodeId);
    if (!sourceNode) {
      return null;
    }
    if (!nodeHasSourceHandle(sourceNode.type) || !nodeHasTargetHandle(targetType)) {
      return null;
    }

    const targetPosition = state.findNodePosition(sourceNodeId, DEFAULT_NODE_WIDTH, 220);
    const derivedFrom = resolveDerivedFromMeta(sourceNode);
    const targetData = derivedFrom
      ? ({ derivedFrom } as Partial<CanvasNodeData>)
      : undefined;
    const newNode = applyDefaultGenerationParams(
      canvasNodeFactory.createNode(targetType, targetPosition, targetData),
      targetData
    );
    const sourceHandle = resolveManualConnectionSourceHandle(sourceNode);
    const targetHandle = resolveManualConnectionTargetHandle(targetType);
    const edgeId = `e-${sourceNodeId}-${newNode.id}-${sourceHandle}-${targetHandle}`;
    const nextEdges = addEdge<CanvasEdge>(
      {
        id: edgeId,
        source: sourceNodeId,
        target: newNode.id,
        sourceHandle,
        targetHandle,
        type: 'disconnectableEdge',
      },
      state.edges
    );

    set({
      nodes: [...state.nodes, newNode],
      edges: nextEdges,
      selectedNodeId: newNode.id,
      activeToolDialog: null,
      history: {
        past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
        future: [],
      },
      dragHistorySnapshot: null,
    });

    return newNode.id;
  },

  duplicateAsNewShot: (nodeId) => {
    const state = get();
    const sourceNode = state.nodes.find((node) => node.id === nodeId);
    if (!sourceNode || (!isImageEditNode(sourceNode) && !isStoryboardGenNode(sourceNode))) {
      return null;
    }

    const sourceData = { ...sourceNode.data } as CanvasNodeData & Record<string, unknown>;
    sourceData.displayName = undefined;
    sourceData.isGenerating = false;
    sourceData.generationStartedAt = null;
    sourceData.generationJobId = null;
    sourceData.generationProviderId = null;
    sourceData.generationClientSessionId = null;
    sourceData.generationError = null;
    sourceData.generationErrorDetails = null;
    sourceData.generationDebugContext = undefined;
    sourceData.currentBatch = undefined;
    sourceData.derivedFrom = undefined;

    if ('imageUrl' in sourceData) {
      sourceData.imageUrl = null;
    }
    if ('previewImageUrl' in sourceData) {
      sourceData.previewImageUrl = null;
    }
    if ('generatedResultNodeIds' in sourceData) {
      sourceData.generatedResultNodeIds = [];
    }

    const sourceSize = getNodeSize(sourceNode);
    const newNode = canvasNodeFactory.createNode(
      sourceNode.type,
      {
        x: Math.round(sourceNode.position.x + sourceSize.width + 88),
        y: Math.round(sourceNode.position.y),
      },
      sourceData
    );
    newNode.width = sourceNode.width;
    newNode.height = sourceNode.height;
    newNode.style = sourceNode.style ? { ...sourceNode.style } : sourceNode.style;

    const inheritedEdges = state.edges
      .filter((edge) => edge.target === sourceNode.id)
      .map((edge) => ({
        ...edge,
        id: `e-${edge.source}-${newNode.id}-${edge.sourceHandle ?? 'source'}-${edge.targetHandle ?? 'target'}`,
        target: newNode.id,
      }));

    set({
      nodes: [...state.nodes, newNode],
      edges: [...state.edges, ...inheritedEdges],
      selectedNodeId: newNode.id,
      history: {
        past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
        future: [],
      },
      dragHistorySnapshot: null,
    });

    return newNode.id;
  },

  addEdge: (source, target) => {
    const state = get();
    // Check if both nodes exist
    const sourceNode = state.nodes.find((n) => n.id === source);
    const targetNode = state.nodes.find((n) => n.id === target);
    if (!sourceNode || !targetNode) {
      return null;
    }
    if (!nodeHasSourceHandle(sourceNode.type) || !nodeHasTargetHandle(targetNode.type)) {
      return null;
    }

    const edgeId = `e-${source}-${target}`;
    // Check if edge already exists
    if (state.edges.some((e) => e.id === edgeId)) {
      return edgeId;
    }

    const newEdge: CanvasEdge = {
      id: edgeId,
      source,
      target,
      sourceHandle: 'source',
      targetHandle: 'target',
      type: 'disconnectableEdge',
    };

    set({
      edges: [...state.edges, newEdge],
    });

    return edgeId;
  },

  findNodePosition: (sourceNodeId, newNodeWidth, newNodeHeight) => {
    const state = get();
    const sourceNode = state.nodes.find((n) => n.id === sourceNodeId);
    if (!sourceNode) {
      return { x: 100, y: 100 };
    }

    // Helper to check if a position collides with existing nodes.
    const collides = (x: number, y: number, width: number, height: number) => {
      return state.nodes.some((node) => {
        const nodeWidth = node.measured?.width ?? DEFAULT_NODE_WIDTH;
        const nodeHeight = node.measured?.height ?? 200;
        const margin = 8;
        return (
          x < node.position.x + nodeWidth + margin &&
          x + width + margin > node.position.x &&
          y < node.position.y + nodeHeight + margin &&
          y + height + margin > node.position.y
        );
      });
    };

    const sourceWidth = sourceNode.measured?.width ?? DEFAULT_NODE_WIDTH;
    const sourceHeight = sourceNode.measured?.height ?? 200;
    const anchorX = sourceNode.position.x + sourceWidth + 28;
    const anchorY = sourceNode.position.y;

    const zoom = Math.max(0.01, state.currentViewport.zoom || 1);
    const viewportWidth = state.canvasViewportSize.width;
    const viewportHeight = state.canvasViewportSize.height;
    const hasViewportBounds = viewportWidth > 0 && viewportHeight > 0;
    const visibleBounds = hasViewportBounds
      ? {
          minX: -state.currentViewport.x / zoom,
          minY: -state.currentViewport.y / zoom,
          maxX: -state.currentViewport.x / zoom + viewportWidth / zoom,
          maxY: -state.currentViewport.y / zoom + viewportHeight / zoom,
        }
      : null;

    const overflowAmount = (x: number, y: number): number => {
      if (!visibleBounds) {
        return 0;
      }
      const overLeft = Math.max(0, visibleBounds.minX - x);
      const overTop = Math.max(0, visibleBounds.minY - y);
      const overRight = Math.max(0, x + newNodeWidth - visibleBounds.maxX);
      const overBottom = Math.max(0, y + newNodeHeight - visibleBounds.maxY);
      return overLeft + overTop + overRight + overBottom;
    };

    const stepX = Math.max(newNodeWidth + 12, 110);
    const stepY = Math.max(Math.round(newNodeHeight * 0.35), 54);
    const baseCandidates = [
      { x: anchorX, y: anchorY },
      { x: sourceNode.position.x, y: sourceNode.position.y + sourceHeight + 20 },
      { x: sourceNode.position.x - newNodeWidth - 20, y: sourceNode.position.y },
      { x: sourceNode.position.x, y: sourceNode.position.y - newNodeHeight - 20 },
    ];

    let bestInView: { x: number; y: number; score: number } | null = null;
    let bestOutOfView: { x: number; y: number; score: number } | null = null;

    const evaluateCandidate = (x: number, y: number) => {
      if (collides(x, y, newNodeWidth, newNodeHeight)) {
        return;
      }

      const dx = x - anchorX;
      const dy = y - anchorY;
      const distanceScore = Math.hypot(dx, dy);
      const upwardPenalty = dy < 0 ? Math.abs(dy) * 0.25 : 0;
      const overflow = overflowAmount(x, y);
      const score = distanceScore + upwardPenalty + overflow * 1000;
      const candidate = { x, y, score };

      if (overflow === 0) {
        if (!bestInView || score < bestInView.score) {
          bestInView = candidate;
        }
      } else if (!bestOutOfView || score < bestOutOfView.score) {
        bestOutOfView = candidate;
      }
    };

    for (const base of baseCandidates) {
      evaluateCandidate(base.x, base.y);
    }

    for (let ring = 1; ring <= 8; ring += 1) {
      const offsets = [
        { x: ring, y: 0 },
        { x: ring, y: 1 },
        { x: ring, y: -1 },
        { x: 0, y: ring },
        { x: 0, y: -ring },
        { x: -ring, y: 0 },
        { x: ring, y: 2 },
        { x: ring, y: -2 },
        { x: -ring, y: 1 },
        { x: -ring, y: -1 },
      ];
      for (const offset of offsets) {
        evaluateCandidate(anchorX + offset.x * stepX, anchorY + offset.y * stepY);
      }
    }

    // If ring sampling misses an available slot in current viewport,
    // run a denser viewport sweep before falling back outside view.
    if (!bestInView && visibleBounds) {
      const padding = 8;
      const minX = visibleBounds.minX + padding;
      const maxX = visibleBounds.maxX - newNodeWidth - padding;
      const minY = visibleBounds.minY + padding;
      const maxY = visibleBounds.maxY - newNodeHeight - padding;

      if (maxX >= minX && maxY >= minY) {
        const scanStepX = Math.max(42, Math.round(newNodeWidth * 0.32));
        const scanStepY = Math.max(42, Math.round(newNodeHeight * 0.32));

        for (let y = minY; y <= maxY; y += scanStepY) {
          for (let x = minX; x <= maxX; x += scanStepX) {
            evaluateCandidate(x, y);
          }
        }

        // Ensure boundary positions are also considered.
        evaluateCandidate(minX, minY);
        evaluateCandidate(maxX, minY);
        evaluateCandidate(minX, maxY);
        evaluateCandidate(maxX, maxY);
      }
    }

    const resolvedCandidate = (bestInView || bestOutOfView) as
      | { x: number; y: number; score: number }
      | null;
    if (resolvedCandidate) {
      return { x: resolvedCandidate.x, y: resolvedCandidate.y };
    }

    return { x: anchorX + 2 * stepX, y: anchorY };
  },

  addDerivedUploadNode: (sourceNodeId, imageUrl, aspectRatio, previewImageUrl) => {
    const state = get();
    const position = getDerivedNodePosition(state.nodes, sourceNodeId);
    const sourceNode = state.nodes.find((node) => node.id === sourceNodeId);
    const resolvedAspectRatio = resolveDerivedAspectRatio(sourceNode, aspectRatio);
    const node = canvasNodeFactory.createNode(CANVAS_NODE_TYPES.upload, position, {
      imageUrl,
      previewImageUrl: previewImageUrl ?? null,
      aspectRatio: resolvedAspectRatio,
    });
    const derivedSize = resolveGeneratedImageNodeDimensions(resolvedAspectRatio);
    node.width = derivedSize.width;
    node.height = derivedSize.height;
    node.style = {
      ...(node.style ?? {}),
      width: derivedSize.width,
      height: derivedSize.height,
    };

    set({
      nodes: [...state.nodes, node],
      selectedNodeId: node.id,
      activeToolDialog: null,
      history: {
        past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
        future: [],
      },
      dragHistorySnapshot: null,
    });

    return node.id;
  },

  addDerivedExportNode: (sourceNodeId, imageUrl, aspectRatio, previewImageUrl, options) => {
    const state = get();
    const sourceNode = state.nodes.find((node) => node.id === sourceNodeId);
    const aspectRatioStrategy = options?.aspectRatioStrategy ?? 'provided';
    const resolvedAspectRatio = aspectRatioStrategy === 'derivedFromSource'
      ? resolveDerivedAspectRatio(sourceNode, aspectRatio)
      : (aspectRatio || resolveDerivedAspectRatio(sourceNode, DEFAULT_ASPECT_RATIO));
    const autoSize = resolveAutoImageNodeDimensions(resolvedAspectRatio, {
      minWidth: EXPORT_RESULT_NODE_MIN_WIDTH,
      minHeight: EXPORT_RESULT_NODE_MIN_HEIGHT,
    });
    const generatedSize = resolveGeneratedImageNodeDimensions(resolvedAspectRatio, {
      minWidth: EXPORT_RESULT_NODE_MIN_WIDTH,
      minHeight: EXPORT_RESULT_NODE_MIN_HEIGHT,
    });
    const sourceSize = sourceNode ? getNodeSize(sourceNode) : null;
    const sizeStrategy = options?.sizeStrategy
      ?? (options?.matchSourceNodeSize ? 'matchSource' : 'generated');
    let derivedSize = generatedSize;
    if (sizeStrategy === 'autoMinEdge') {
      derivedSize = autoSize;
    } else if (sizeStrategy === 'matchSource' && sourceSize) {
      derivedSize = {
        width: Math.max(1, Math.round(sourceSize.width)),
        height: Math.max(1, Math.round(sourceSize.height)),
      };
    }
    const position = state.findNodePosition(
      sourceNodeId,
      derivedSize.width,
      derivedSize.height
    );
    const exportNodeData: Partial<CanvasNodeData> = {
      imageUrl,
      previewImageUrl: previewImageUrl ?? null,
      aspectRatio: resolvedAspectRatio,
    };
    if (options?.defaultTitle) {
      (exportNodeData as { displayName?: string }).displayName = options.defaultTitle;
    }
    if (options?.resultKind) {
      (exportNodeData as { resultKind?: ExportImageNodeResultKind }).resultKind = options.resultKind;
      if (!options.defaultTitle) {
        (exportNodeData as { displayName?: string }).displayName =
          EXPORT_RESULT_DISPLAY_NAME[options.resultKind];
      }
    }
    const node = canvasNodeFactory.createNode(CANVAS_NODE_TYPES.exportImage, position, {
      ...exportNodeData,
    });
    node.width = derivedSize.width;
    node.height = derivedSize.height;
    node.style = {
      ...(node.style ?? {}),
      width: derivedSize.width,
      height: derivedSize.height,
    };

    set({
      nodes: [...state.nodes, node],
      selectedNodeId: node.id,
      activeToolDialog: null,
      history: {
        past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
        future: [],
      },
      dragHistorySnapshot: null,
    });

    return node.id;
  },

  addStoryboardSplitNode: (sourceNodeId, rows, cols, frames, frameAspectRatio) => {
    const state = get();
    const position = getDerivedNodePosition(state.nodes, sourceNodeId);
    const resolvedFrameAspectRatio =
      frameAspectRatio ??
      frames.find((frame) => typeof frame.aspectRatio === 'string')?.aspectRatio ??
      DEFAULT_ASPECT_RATIO;

    const node = canvasNodeFactory.createNode(CANVAS_NODE_TYPES.storyboardSplit, position, {
      gridRows: rows,
      gridCols: cols,
      frames,
      aspectRatio: resolvedFrameAspectRatio,
      frameAspectRatio: resolvedFrameAspectRatio,
      exportOptions: createDefaultStoryboardExportOptions(),
    });

    set({
      nodes: [...state.nodes, node],
      selectedNodeId: node.id,
      activeToolDialog: null,
      history: {
        past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
        future: [],
      },
      dragHistorySnapshot: null,
    });

    return node.id;
  },

  deriveOrUpdateResultBatch: ({
    sourceGenNodeId,
    batchId,
    kind,
    snapshotParams,
    successfulVariants,
  }) => {
    const state = get();
    const sourceNode = state.nodes.find((node) => node.id === sourceGenNodeId);
    if (!sourceNode || !nodeCanSourceResultBatch(sourceNode, kind)) {
      return null;
    }
    return deriveOrUpdateResultBatchNode({
      state,
      sourceNode,
      sourceGenNodeId,
      batchId,
      kind,
      snapshotParams,
      successfulVariants,
      set,
    });
    /*

    const sequenceNumber = (sourceNode as { data: VideoGenNodeData }).data.generatedResultNodeIds.length + 1;
    const position = getVideoResultDerivedPosition(sourceNode as CanvasNode, sequenceNumber);
    const resultNode = canvasNodeFactory.createNode(CANVAS_NODE_TYPES.videoResult, position, {
      displayName: `视频片段 #${sequenceNumber}`,
      sourceGenNodeId,
      sequenceNumber,
      generatedAt: Date.now(),
      snapshotParams,
      videoRef,
      thumbnailRef,
      videoDurationSeconds,
      klingTaskId,
      klingVideoId,
      stack: [],
      activeIndex: 0,
      pendingCandidates: null,
      candidateSelection: [],
    });
    resultNode.width = VIDEO_RESULT_NODE_DEFAULT_WIDTH;
    resultNode.height = VIDEO_RESULT_NODE_DEFAULT_HEIGHT;
    resultNode.style = {
      ...(resultNode.style ?? {}),
      width: VIDEO_RESULT_NODE_DEFAULT_WIDTH,
      height: VIDEO_RESULT_NODE_DEFAULT_HEIGHT,
    };

    const edgeId = `e-${sourceGenNodeId}-${resultNode.id}`;
    const newEdge: CanvasEdge = {
      id: edgeId,
      source: sourceGenNodeId,
      target: resultNode.id,
      sourceHandle: 'result-output',
      targetHandle: 'gen-input',
      type: 'disconnectableEdge',
    };

    const nextNodes = state.nodes.map((node) => {
      if (node.id !== sourceGenNodeId || !isVideoGenNode(node)) {
        return node;
      }
      return {
        ...node,
        data: {
          ...node.data,
          generatedResultNodeIds: [...node.data.generatedResultNodeIds, resultNode.id],
          currentTask: undefined,
        },
      };
    });
    nextNodes.push(resultNode);

    set({
      nodes: nextNodes,
      edges: [...state.edges, newEdge],
      selectedNodeId: resultNode.id,
      activeToolDialog: null,
      history: {
        past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
        future: [],
      },
      dragHistorySnapshot: null,
    });

    return resultNode.id;
  },

    */
  },
  selectVariant: ({ resultNodeId, variantIndex }) => {
    const state = get();
    let changed = false;
    const nextNodes = state.nodes.map((node) => {
      if (node.id !== resultNodeId) {
        return node;
      }

      if (isVideoResultNode(node)) {
        const nextIndex = clampIndex(variantIndex, node.data.variants.length);
        if (nextIndex === node.data.selectedVariantIndex) {
          return node;
        }
        changed = true;
        return {
          ...node,
          data: syncVideoResultResolvedFields({
            ...node.data,
            selectedVariantIndex: nextIndex,
          }),
        };
      }

      if (isImageResultNode(node)) {
        const nextIndex = clampIndex(variantIndex, node.data.variants.length);
        if (nextIndex === node.data.selectedVariantIndex) {
          return node;
        }
        changed = true;
        return {
          ...node,
          data: syncImageResultResolvedFields({
            ...node.data,
            selectedVariantIndex: nextIndex,
          }),
        };
      }

      return node;
    });
    if (!changed) {
      return false;
    }
    set({
      nodes: nextNodes,
      history: {
        past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
        future: [],
      },
      dragHistorySnapshot: null,
    });
    return true;
  },

  deleteVariant: ({ resultNodeId, variantIndex }) => {
    const state = get();
    const targetNode = state.nodes.find((node) => node.id === resultNodeId);
    if (!targetNode || (!isVideoResultNode(targetNode) && !isImageResultNode(targetNode))) {
      return false;
    }

    const nextVariants = targetNode.data.variants.filter((_, index) => index !== variantIndex);
    if (nextVariants.length === targetNode.data.variants.length) {
      return false;
    }

    if (nextVariants.length === 0) {
      get().deleteNode(resultNodeId);
      return true;
    }

    const nextNodes = state.nodes.map((node) => {
      if (node.id !== resultNodeId) {
        return node;
      }

      if (isVideoResultNode(node)) {
        return {
          ...node,
          data: syncVideoResultResolvedFields({
            ...node.data,
            variants: nextVariants as VideoVariant[],
            selectedVariantIndex: clampIndex(
              node.data.selectedVariantIndex >= nextVariants.length ? 0 : node.data.selectedVariantIndex,
              nextVariants.length
            ),
          }),
        };
      }

      if (isImageResultNode(node)) {
        return {
          ...node,
          data: syncImageResultResolvedFields({
            ...node.data,
            variants: nextVariants as ImageVariant[],
            selectedVariantIndex: clampIndex(
              node.data.selectedVariantIndex >= nextVariants.length ? 0 : node.data.selectedVariantIndex,
              nextVariants.length
            ),
          }),
        };
      }

      return node;
    });

    set({
      nodes: nextNodes,
      history: {
        past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
        future: [],
      },
      dragHistorySnapshot: null,
    });
    return true;
  },

  appendCandidatesToNode: (nodeId, candidates) => {
    const state = get();
    const targetNode = state.nodes.find((node) => node.id === nodeId);
    if (!targetNode) {
      return false;
    }

    let changed = false;
    const nextNodes = state.nodes.map((node) => {
      if (node.id !== nodeId) {
        return node;
      }

      if (isVideoResultNode(node)) {
        const nextCandidates = [
          ...(node.data.pendingCandidates ?? []),
          ...(candidates as VideoResultStackItem[]).map((candidate) => normalizeVideoResultStackItem(candidate)),
        ];
        changed = true;
        return {
          ...node,
          data: syncVideoResultResolvedFields({
            ...node.data,
            pendingCandidates: nextCandidates,
            candidateSelection: [],
          }),
        };
      }

      return node;
    });

    if (!changed) {
      return false;
    }

    set({
      nodes: nextNodes,
      history: {
        past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
        future: [],
      },
      dragHistorySnapshot: null,
    });
    return true;
  },

  adoptCandidates: (nodeId, selectedIndices) => {
    const state = get();
    let changed = false;
    const nextNodes = state.nodes.map((node) => {
      if (node.id !== nodeId) {
        return node;
      }

      if (isVideoResultNode(node)) {
        const pending = node.data.pendingCandidates ?? [];
        const adoptedIndices = normalizeSelectedIndices(selectedIndices, pending.length);
        if (adoptedIndices.length === 0) {
          return node;
        }
        const adoptedItems = adoptedIndices.map((index) => pending[index]);
        changed = true;
        return {
          ...node,
          data: syncVideoResultResolvedFields({
            ...node.data,
            stack: [...node.data.stack, ...adoptedItems],
            activeIndex: node.data.stack.length,
            pendingCandidates: null,
            candidateSelection: [],
          }),
        };
      }

      return node;
    });

    if (!changed) {
      return false;
    }

    set({
      nodes: nextNodes,
      history: {
        past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
        future: [],
      },
      dragHistorySnapshot: null,
    });
    return true;
  },

  discardAllCandidates: (nodeId) => {
    const state = get();
    let changed = false;
    const nextNodes = state.nodes.map((node) => {
      if (node.id !== nodeId) {
        return node;
      }

      if (isVideoResultNode(node)) {
        if (!node.data.pendingCandidates) {
          return node;
        }
        changed = true;
        return {
          ...node,
          data: syncVideoResultResolvedFields({
            ...node.data,
            pendingCandidates: null,
            candidateSelection: [],
          }),
        };
      }

      return node;
    });

    if (!changed) {
      return false;
    }

    set({
      nodes: nextNodes,
      history: {
        past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
        future: [],
      },
      dragHistorySnapshot: null,
    });
    return true;
  },

  setActiveIndex: (nodeId, index) => {
    const state = get();
    let changed = false;
    const nextNodes = state.nodes.map((node) => {
      if (node.id !== nodeId) {
        return node;
      }

      if (isVideoResultNode(node)) {
        const nextIndex = clampIndex(index, node.data.stack.length);
        if (nextIndex === node.data.activeIndex) {
          return node;
        }
        changed = true;
        return {
          ...node,
          data: syncVideoResultResolvedFields({
            ...node.data,
            activeIndex: nextIndex,
          }),
        };
      }

      return node;
    });

    if (!changed) {
      return false;
    }

    set({
      nodes: nextNodes,
      history: {
        past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
        future: [],
      },
      dragHistorySnapshot: null,
    });
    return true;
  },

  updateNodeData: (nodeId, data) => {
    set((state) => {
      let changed = false;
      const nextNodes = state.nodes.map((node) => {
        if (node.id !== nodeId) {
          return node;
        }

        const hasDataChange = Object.entries(data).some(([key, nextValue]) => {
          const previousValue = (node.data as Record<string, unknown>)[key];
          return !Object.is(previousValue, nextValue);
        });
        if (!hasDataChange) {
          return node;
        }

        const mergedData = {
          ...node.data,
          ...data,
        } as CanvasNodeData;
        const normalizedData = isImageEditNode({ ...node, data: mergedData } as CanvasNode)
          ? syncImageEditResolvedFields(mergedData as ImageEditNodeData)
          : isVideoResultNode({ ...node, data: mergedData } as CanvasNode)
            ? syncVideoResultResolvedFields(mergedData as VideoResultNodeData)
            : mergedData;
        const resizedNode = maybeApplyImageAutoResize(
          {
            ...node,
            data: normalizedData,
          },
          data
        );

        changed = true;
        return resizedNode;
      });

      if (!changed) {
        return {};
      }

      return {
        nodes: nextNodes,
        history: {
          past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
          future: [],
        },
        dragHistorySnapshot: null,
      };
    });
  },

  updateNodePosition: (nodeId, position) => {
    set((state) => {
      let changed = false;
      const nextNodes = state.nodes.map((node) => {
        if (node.id !== nodeId) {
          return node;
        }

        if (node.position.x === position.x && node.position.y === position.y) {
          return node;
        }

        changed = true;
        return {
          ...node,
          position,
        };
      });

      if (!changed) {
        return {};
      }

      return { nodes: nextNodes };
    });
  },

  updateStoryboardFrame: (nodeId, frameId, data) => {
    set((state) => {
      let changed = false;
      const nextNodes = state.nodes.map((node) => {
        if (node.id !== nodeId || !isStoryboardSplitNode(node)) {
          return node;
        }

        const nextFrames = node.data.frames.map((frame) => {
          if (frame.id !== frameId) {
            return frame;
          }

          const patchEntries = Object.entries(data) as Array<
            [keyof StoryboardFrameItem, StoryboardFrameItem[keyof StoryboardFrameItem]]
          >;
          const hasFrameChange = patchEntries.some(([key, nextValue]) =>
            !Object.is(frame[key], nextValue)
          );
          if (!hasFrameChange) {
            return frame;
          }

          changed = true;
          return {
            ...frame,
            ...data,
          };
        });

        return {
          ...node,
          data: {
            ...node.data,
            frames: nextFrames,
          },
        };
      });

      if (!changed) {
        return {};
      }

      return {
        nodes: nextNodes,
        history: {
          past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
          future: [],
        },
        dragHistorySnapshot: null,
      };
    });
  },

  reorderStoryboardFrame: (nodeId, draggedFrameId, targetFrameId) => {
    set((state) => {
      let changed = false;
      const nextNodes = state.nodes.map((node) => {
        if (node.id !== nodeId || !isStoryboardSplitNode(node)) {
          return node;
        }

        const frames = [...node.data.frames].sort((a, b) => a.order - b.order);
        const fromIndex = frames.findIndex((frame) => frame.id === draggedFrameId);
        const toIndex = frames.findIndex((frame) => frame.id === targetFrameId);

        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
          return node;
        }

        changed = true;
        const [movedFrame] = frames.splice(fromIndex, 1);
        frames.splice(toIndex, 0, movedFrame);

        return {
          ...node,
          data: {
            ...node.data,
            frames: frames.map((frame, index) => ({
              ...frame,
              order: index,
            })),
          },
        };
      });

      if (!changed) {
        return {};
      }

      return {
        nodes: nextNodes,
        history: {
          past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
          future: [],
        },
        dragHistorySnapshot: null,
      };
    });
  },

  deleteNode: (nodeId) => {
    get().deleteNodes([nodeId]);
  },

  deleteNodes: (nodeIds) => {
    const uniqueIds = Array.from(new Set(nodeIds.filter((nodeId) => nodeId.trim().length > 0)));
    if (uniqueIds.length === 0) {
      return;
    }

    set((state) => {
      const existingIds = uniqueIds.filter((nodeId) => state.nodes.some((node) => node.id === nodeId));
      if (existingIds.length === 0) {
        return {};
      }

      const deleteSet = collectNodeIdsWithDescendants(state.nodes, existingIds);
      const nextNodes = state.nodes.filter((node) => !deleteSet.has(node.id));
      const nextEdges = state.edges.filter(
        (edge) => !deleteSet.has(edge.source) && !deleteSet.has(edge.target)
      );

      return {
        nodes: nextNodes,
        edges: nextEdges,
        selectedNodeId:
          state.selectedNodeId && deleteSet.has(state.selectedNodeId) ? null : state.selectedNodeId,
        activeToolDialog:
          state.activeToolDialog && deleteSet.has(state.activeToolDialog.nodeId)
            ? null
            : state.activeToolDialog,
        history: {
          past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
          future: [],
        },
        dragHistorySnapshot: null,
      };
    });
  },

  groupNodes: (nodeIds) => {
    const uniqueIds = Array.from(new Set(nodeIds.filter((nodeId) => nodeId.trim().length > 0)));
    if (uniqueIds.length < 2) {
      return null;
    }

    const state = get();
    const nodeMap = new Map(state.nodes.map((node) => [node.id, node] as const));
    const existingIds = uniqueIds.filter((nodeId) => nodeMap.has(nodeId));
    if (existingIds.length < 2) {
      return null;
    }

    const selectedSet = new Set(existingIds);
    const memberIds = existingIds.filter((nodeId) => {
      let currentParentId = nodeMap.get(nodeId)?.parentId;
      const visited = new Set<string>();
      while (currentParentId && !visited.has(currentParentId)) {
        if (selectedSet.has(currentParentId)) {
          return false;
        }
        visited.add(currentParentId);
        currentParentId = nodeMap.get(currentParentId)?.parentId;
      }
      return true;
    });
    if (memberIds.length < 2) {
      return null;
    }

    const memberSet = new Set(memberIds);
    const members = memberIds
      .map((id) => nodeMap.get(id))
      .filter((node): node is CanvasNode => Boolean(node));

    const absoluteBounds = members.reduce(
      (acc, node) => {
        const absolute = resolveAbsolutePosition(node, nodeMap);
        const size = getNodeSize(node);
        return {
          minX: Math.min(acc.minX, absolute.x),
          minY: Math.min(acc.minY, absolute.y),
          maxX: Math.max(acc.maxX, absolute.x + size.width),
          maxY: Math.max(acc.maxY, absolute.y + size.height),
        };
      },
      {
        minX: Number.POSITIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
      }
    );

    if (!Number.isFinite(absoluteBounds.minX) || !Number.isFinite(absoluteBounds.minY)) {
      return null;
    }

    const SIDE_PADDING = 20;
    const TOP_PADDING = 34;
    const BOTTOM_PADDING = 20;
    const groupX = Math.round(absoluteBounds.minX - SIDE_PADDING);
    const groupY = Math.round(absoluteBounds.minY - TOP_PADDING);
    const groupWidth = Math.round(
      Math.max(220, absoluteBounds.maxX - absoluteBounds.minX + SIDE_PADDING * 2)
    );
    const groupHeight = Math.round(
      Math.max(140, absoluteBounds.maxY - absoluteBounds.minY + TOP_PADDING + BOTTOM_PADDING)
    );

    const existingGroupCount = state.nodes.filter((node) => node.type === CANVAS_NODE_TYPES.group).length;
    const groupDisplayName = `组 ${existingGroupCount + 1}`;
    const groupNode = canvasNodeFactory.createNode(
      CANVAS_NODE_TYPES.group,
      { x: groupX, y: groupY },
      {
        label: groupDisplayName,
        displayName: groupDisplayName,
      }
    );
    groupNode.style = { width: groupWidth, height: groupHeight };
    groupNode.selected = true;

    const updatedMemberMap = new Map<string, CanvasNode>();
    for (const node of members) {
      const absolute = resolveAbsolutePosition(node, nodeMap);
      updatedMemberMap.set(node.id, {
        ...node,
        parentId: groupNode.id,
        extent: 'parent',
        position: {
          x: Math.round(absolute.x - groupX),
          y: Math.round(absolute.y - groupY),
        },
        selected: false,
      });
    }

    const firstMemberIndex = state.nodes.reduce((acc, node, index) => {
      if (!memberSet.has(node.id)) {
        return acc;
      }
      return acc === -1 ? index : Math.min(acc, index);
    }, -1);

    const nextNodes: CanvasNode[] = [];
    let insertedGroup = false;
    for (let index = 0; index < state.nodes.length; index += 1) {
      const node = state.nodes[index];
      if (!insertedGroup && index === firstMemberIndex) {
        nextNodes.push(groupNode);
        insertedGroup = true;
      }

      const updatedMember = updatedMemberMap.get(node.id);
      if (updatedMember) {
        nextNodes.push(updatedMember);
      } else {
        nextNodes.push({
          ...node,
          selected: false,
        });
      }
    }

    if (!insertedGroup) {
      nextNodes.push(groupNode);
    }

    set({
      nodes: nextNodes,
      selectedNodeId: groupNode.id,
      activeToolDialog:
        state.activeToolDialog && memberSet.has(state.activeToolDialog.nodeId)
          ? null
          : state.activeToolDialog,
      history: {
        past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
        future: [],
      },
      dragHistorySnapshot: null,
    });

    return groupNode.id;
  },

  ungroupNode: (groupNodeId) => {
    const state = get();
    const groupNode = state.nodes.find(
      (node) => node.id === groupNodeId && node.type === CANVAS_NODE_TYPES.group
    );
    if (!groupNode) {
      return false;
    }

    const nodeMap = new Map(state.nodes.map((node) => [node.id, node] as const));
    const children = state.nodes.filter((node) => node.parentId === groupNodeId);
    if (children.length === 0) {
      return false;
    }

    const nextNodes = state.nodes
      .filter((node) => node.id !== groupNodeId)
      .map((node) => {
        if (node.parentId !== groupNodeId) {
          return node;
        }

        const absolute = resolveAbsolutePosition(node, nodeMap);
        return {
          ...node,
          parentId: undefined,
          extent: undefined,
          position: {
            x: Math.round(absolute.x),
            y: Math.round(absolute.y),
          },
          selected: false,
        };
      });

    const nextEdges = state.edges.filter(
      (edge) => edge.source !== groupNodeId && edge.target !== groupNodeId
    );

    set({
      nodes: nextNodes,
      edges: nextEdges,
      selectedNodeId: state.selectedNodeId === groupNodeId ? null : state.selectedNodeId,
      activeToolDialog:
        state.activeToolDialog?.nodeId === groupNodeId ? null : state.activeToolDialog,
      history: {
        past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
        future: [],
      },
      dragHistorySnapshot: null,
    });

    return true;
  },

  deleteEdge: (edgeId) => {
    set((state) => {
      const hasEdge = state.edges.some((edge) => edge.id === edgeId);
      if (!hasEdge) {
        return {};
      }

      return {
        edges: state.edges.filter((edge) => edge.id !== edgeId),
        history: {
          past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
          future: [],
        },
        dragHistorySnapshot: null,
      };
    });
  },

  setSelectedNode: (nodeId) => {
    set({ selectedNodeId: nodeId });
  },

  openToolDialog: (dialog) => {
    set({ activeToolDialog: dialog });
  },

  closeToolDialog: () => {
    set({ activeToolDialog: null });
  },

  undo: () => {
    const state = get();
    const target = state.history.past[state.history.past.length - 1];
    if (!target) {
      return false;
    }

    const currentSnapshot = createSnapshot(state.nodes, state.edges);
    const nextPast = state.history.past.slice(0, -1);

    set({
      nodes: target.nodes,
      edges: target.edges,
      selectedNodeId: resolveSelectedNodeId(state.selectedNodeId, target.nodes),
      activeToolDialog: resolveActiveToolDialog(state.activeToolDialog, target.nodes),
      history: {
        past: nextPast,
        future: pushSnapshot(state.history.future, currentSnapshot),
      },
      dragHistorySnapshot: null,
    });
    return true;
  },

  redo: () => {
    const state = get();
    const target = state.history.future[state.history.future.length - 1];
    if (!target) {
      return false;
    }

    const currentSnapshot = createSnapshot(state.nodes, state.edges);
    const nextFuture = state.history.future.slice(0, -1);

    set({
      nodes: target.nodes,
      edges: target.edges,
      selectedNodeId: resolveSelectedNodeId(state.selectedNodeId, target.nodes),
      activeToolDialog: resolveActiveToolDialog(state.activeToolDialog, target.nodes),
      history: {
        past: pushSnapshot(state.history.past, currentSnapshot),
        future: nextFuture,
      },
      dragHistorySnapshot: null,
    });
    return true;
  },

  clearCanvas: () => {
    set((state) => {
      if (state.nodes.length === 0 && state.edges.length === 0) {
        return {};
      }

      return {
        nodes: [],
        edges: [],
        selectedNodeId: null,
        activeToolDialog: null,
        history: {
          past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
          future: [],
        },
        dragHistorySnapshot: null,
      };
    });
  },
}));
