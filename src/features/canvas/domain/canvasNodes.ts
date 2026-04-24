import type { Edge, Node, XYPosition } from '@xyflow/react';

export const CANVAS_NODE_TYPES = {
  upload: 'uploadNode',
  imageEdit: 'imageNode',
  imageResult: 'imageResultNode',
  exportImage: 'exportImageNode',
  textAnnotation: 'textAnnotationNode',
  group: 'groupNode',
  storyboardSplit: 'storyboardNode',
  storyboardGen: 'storyboardGenNode',
  sceneComposer: 'sceneComposerNode',
  videoGen: 'videoGenNode',
  videoResult: 'videoResultNode',
} as const;

export type CanvasNodeType = (typeof CANVAS_NODE_TYPES)[keyof typeof CANVAS_NODE_TYPES];

const DISCARDED_CANVAS_NODE_TYPES = new Set<string>([
  'scriptUploadNode',
  'storyboardLlmNode',
]);

export function isDiscardedCanvasNodeType(type: unknown): boolean {
  return typeof type === 'string' && DISCARDED_CANVAS_NODE_TYPES.has(type);
}

export const DEFAULT_ASPECT_RATIO = '1:1';
export const AUTO_REQUEST_ASPECT_RATIO = 'auto';
export const DEFAULT_NODE_WIDTH = 220;
export const EXPORT_RESULT_NODE_DEFAULT_WIDTH = 384;
export const EXPORT_RESULT_NODE_LAYOUT_HEIGHT = 288;
export const EXPORT_RESULT_NODE_MIN_WIDTH = 168;
export const EXPORT_RESULT_NODE_MIN_HEIGHT = 168;

export const IMAGE_SIZES = ['0.5K', '1K', '2K', '4K'] as const;
export const IMAGE_ASPECT_RATIOS = [
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '21:9',
] as const;

export type ImageSize = (typeof IMAGE_SIZES)[number];

export interface NodeDisplayData {
  displayName?: string;
  [key: string]: unknown;
}

export interface NodeImageData extends NodeDisplayData {
  imageUrl: string | null;
  previewImageUrl?: string | null;
  aspectRatio: string;
  isSizeManuallyAdjusted?: boolean;
  [key: string]: unknown;
}

export interface UploadImageNodeData extends NodeImageData {
  sourceFileName?: string | null;
}

export type ExportImageNodeResultKind =
  | 'generic'
  | 'storyboardGenOutput'
  | 'storyboardSplitExport'
  | 'storyboardFrameEdit';

export interface ExportImageNodeData extends NodeImageData {
  resultKind?: ExportImageNodeResultKind;
}

export interface GroupNodeData extends NodeDisplayData {
  label: string;
  [key: string]: unknown;
}

export interface TextAnnotationNodeData extends NodeDisplayData {
  content: string;
  [key: string]: unknown;
}

export interface ImageEditNodeData extends NodeImageData {
  prompt: string;
  model: string;
  size: ImageSize;
  requestAspectRatio?: string;
  extraParams?: Record<string, unknown>;
  isGenerating?: boolean;
  generationStartedAt?: number | null;
  generationDurationMs?: number;
  outputCount: number;
  generatedResultNodeIds: string[];
  currentBatch?: {
    batchId: string;
    submittedAt: number;
    subTasks: SubTaskMeta[];
  };
  derivedFrom?: DerivedFromMeta;
}

export interface ImageEditStackItem {
  imageUrl: string;
  previewImageUrl?: string | null;
  aspectRatio: string;
}

export interface SubTaskMeta {
  subTaskId: string;
  variantId: string;
  providerTaskId?: string;
  status: 'pending' | 'submitted' | 'processing' | 'succeed' | 'failed' | 'abandoned';
  progress: number;
  errorMessage?: string;
  errorCode?: number;
}

export interface StoryboardFrameItem {
  id: string;
  imageUrl: string | null;
  previewImageUrl?: string | null;
  aspectRatio?: string;
  note: string;
  order: number;
}

export interface StoryboardExportOptions {
  showFrameIndex: boolean;
  showFrameNote: boolean;
  notePlacement: 'overlay' | 'bottom';
  imageFit: 'cover' | 'contain';
  frameIndexPrefix: string;
  cellGap: number;
  outerPadding: number;
  fontSize: number;
  backgroundColor: string;
  textColor: string;
}

export interface StoryboardSplitNodeData {
  displayName?: string;
  aspectRatio: string;
  frameAspectRatio?: string;
  gridRows: number;
  gridCols: number;
  frames: StoryboardFrameItem[];
  exportOptions?: StoryboardExportOptions;
  [key: string]: unknown;
}

export interface StoryboardGenFrameItem {
  id: string;
  description: string;
  referenceIndex: number | null;
}

export type StoryboardRatioControlMode = 'overall' | 'cell';

export interface StoryboardGenNodeData {
  displayName?: string;
  gridRows: number;
  gridCols: number;
  frames: StoryboardGenFrameItem[];
  ratioControlMode?: StoryboardRatioControlMode;
  model: string;
  size: ImageSize;
  requestAspectRatio: string;
  extraParams?: Record<string, unknown>;
  imageUrl: string | null;
  previewImageUrl?: string | null;
  aspectRatio: string;
  isGenerating?: boolean;
  generationStartedAt?: number | null;
  generationDurationMs?: number;
  derivedFrom?: DerivedFromMeta;
  [key: string]: unknown;
}

export interface DerivedFromMeta {
  sourceResultNodeId: string;
  derivedFromVariantIndex: number;
  derivedFromVariantId: string;
  derivedAt: number;
}

export interface SceneComposerNodeData extends NodeDisplayData {
  displayName: string;
  /** 输入参考图（来自上游图片节点） */
  inputImageUrl?: string | null;
  /** 导出的构图参考图 dataURL (PNG) */
  compositionImageUrl: string | null;
  /** 导出的场景 JSON（相机 + 物体位置 + 画幅） */
  sceneJson: string | null;
  /** 生成的文字提示词（基于相机描述 + 物体位置） */
  compositionPrompt: string | null;
}

export interface VideoGenNodeData extends NodeDisplayData {
  modelId: string;
  prompt: string;
  negativePrompt?: string;
  duration: 3 | 5 | 10 | 15 | number;
  aspectRatio: '16:9' | '9:16' | '1:1';
  extraParams?: Record<string, unknown>;
  outputCount: number;
  currentBatch?: {
    batchId: string;
    submittedAt: number;
    subTasks: Array<{
      subTaskId: string;
      variantId: string;
      klingTaskId?: string;
      status: 'pending' | 'submitted' | 'processing' | 'succeed' | 'failed' | 'abandoned';
      progress: number;
      errorMessage?: string;
      errorCode?: number;
    }>;
  };
  // Legacy single-task view retained in Round 1 so existing node UI compiles unchanged.
  currentTask?: {
    taskId: string;
    status: 'pending' | 'submitted' | 'processing' | 'succeed' | 'failed' | 'abandoned';
    progress: number;
    errorMessage?: string;
    errorCode?: number;
    submittedAt: number;
  };
  derivedFrom?: DerivedFromMeta;
  generatedResultNodeIds: string[];
}

export interface VideoVariant {
  variantId: string;
  klingTaskId: string;
  klingVideoId?: string;
  videoRef: string;
  thumbnailRef: string;
  videoDurationSeconds: number;
  generatedAt: number;
  snapshotParams: VideoResultNodeData['snapshotParams'];
}

export interface ImageVariant {
  variantId: string;
  imageUrl: string;
  createdAt: number;
}

export interface VideoResultNodeData extends NodeDisplayData {
  sourceGenNodeId: string;
  batchId: string;
  batchCreatedAt: number;
  snapshotParams: {
    modelId: string;
    prompt: string;
    negativePrompt?: string;
    duration: number;
    aspectRatio: string;
    extraParams?: Record<string, unknown>;
    firstFrameRef: string;
    tailFrameRef?: string;
  };
  variants: VideoVariant[];
  selectedVariantIndex: number;
  // Legacy single-variant view retained in Round 1 so existing node UI compiles unchanged.
  stack: VideoVariant[];
  activeIndex: number;
  pendingCandidates: VideoVariant[] | null;
  candidateSelection: number[];
}

export interface ImageResultNodeData extends NodeDisplayData {
  sourceGenNodeId: string;
  batchId: string;
  batchCreatedAt: number;
  snapshotParams: Record<string, unknown>;
  variants: ImageVariant[];
  selectedVariantIndex: number;
}

export type VideoResultStackItem = VideoVariant;

export type CanvasNodeData =
  | UploadImageNodeData
  | ExportImageNodeData
  | TextAnnotationNodeData
  | GroupNodeData
  | ImageEditNodeData
  | StoryboardSplitNodeData
  | StoryboardGenNodeData
  | SceneComposerNodeData
  | VideoGenNodeData
  | VideoResultNodeData
  | ImageResultNodeData;

export type CanvasNode = Node<CanvasNodeData, CanvasNodeType>;
export type CanvasEdge = Edge;

export interface NodeCreationDto {
  type: CanvasNodeType;
  position: XYPosition;
  data?: Partial<CanvasNodeData>;
}

export interface StoryboardNodeCreationDto {
  position: XYPosition;
  rows: number;
  cols: number;
  frames: StoryboardFrameItem[];
}

export const NODE_TOOL_TYPES = {
  crop: 'crop',
  annotate: 'annotate',
  splitStoryboard: 'split-storyboard',
} as const;

export type NodeToolType = (typeof NODE_TOOL_TYPES)[keyof typeof NODE_TOOL_TYPES];

export interface ActiveToolDialog {
  nodeId: string;
  toolType: NodeToolType;
}

export function isUploadNode(
  node: CanvasNode | null | undefined
): node is Node<UploadImageNodeData, typeof CANVAS_NODE_TYPES.upload> {
  return node?.type === CANVAS_NODE_TYPES.upload;
}

export function isImageEditNode(
  node: CanvasNode | null | undefined
): node is Node<ImageEditNodeData, typeof CANVAS_NODE_TYPES.imageEdit> {
  return node?.type === CANVAS_NODE_TYPES.imageEdit;
}

export function isExportImageNode(
  node: CanvasNode | null | undefined
): node is Node<ExportImageNodeData, typeof CANVAS_NODE_TYPES.exportImage> {
  return node?.type === CANVAS_NODE_TYPES.exportImage;
}

export function isImageResultNode(
  node: CanvasNode | null | undefined
): node is Node<ImageResultNodeData, typeof CANVAS_NODE_TYPES.imageResult> {
  return node?.type === CANVAS_NODE_TYPES.imageResult;
}

export function isGroupNode(
  node: CanvasNode | null | undefined
): node is Node<GroupNodeData, typeof CANVAS_NODE_TYPES.group> {
  return node?.type === CANVAS_NODE_TYPES.group;
}

export function isTextAnnotationNode(
  node: CanvasNode | null | undefined
): node is Node<TextAnnotationNodeData, typeof CANVAS_NODE_TYPES.textAnnotation> {
  return node?.type === CANVAS_NODE_TYPES.textAnnotation;
}

export function isStoryboardSplitNode(
  node: CanvasNode | null | undefined
): node is Node<StoryboardSplitNodeData, typeof CANVAS_NODE_TYPES.storyboardSplit> {
  return node?.type === CANVAS_NODE_TYPES.storyboardSplit;
}

export function isStoryboardGenNode(
  node: CanvasNode | null | undefined
): node is Node<StoryboardGenNodeData, typeof CANVAS_NODE_TYPES.storyboardGen> {
  return node?.type === CANVAS_NODE_TYPES.storyboardGen;
}

export function isSceneComposerNode(
  node: CanvasNode | null | undefined
): node is Node<SceneComposerNodeData, typeof CANVAS_NODE_TYPES.sceneComposer> {
  return node?.type === CANVAS_NODE_TYPES.sceneComposer;
}

export function isVideoGenNode(
  node: CanvasNode | null | undefined
): node is Node<VideoGenNodeData, typeof CANVAS_NODE_TYPES.videoGen> {
  return node?.type === CANVAS_NODE_TYPES.videoGen;
}

export function isVideoResultNode(
  node: CanvasNode | null | undefined
): node is Node<VideoResultNodeData, typeof CANVAS_NODE_TYPES.videoResult> {
  return node?.type === CANVAS_NODE_TYPES.videoResult;
}


export function nodeHasImage(node: CanvasNode | null | undefined): boolean {
  if (!node) {
    return false;
  }

  if (isUploadNode(node) || isExportImageNode(node)) {
    return Boolean(node.data.imageUrl);
  }

  if (isImageEditNode(node)) {
    return Boolean(getNodePrimaryImageUrl(node));
  }

  if (isStoryboardSplitNode(node)) {
    return node.data.frames.some((frame) => Boolean(frame.imageUrl));
  }

  if (isStoryboardGenNode(node)) {
    return Boolean(node.data.imageUrl);
  }

  return false;
}

export function getNodePrimaryImageUrl(node: CanvasNode | null | undefined): string | null {
  if (!node) return null;

  if (isUploadNode(node) || isExportImageNode(node) || isStoryboardGenNode(node)) {
    return node.data.imageUrl ?? null;
  }

  if (isImageEditNode(node)) {
    return node.data.imageUrl ?? null;
  }

  if (isImageResultNode(node)) {
    const selectedVariant =
      node.data.variants[node.data.selectedVariantIndex]
      ?? node.data.variants[0]
      ?? null;
    return selectedVariant?.imageUrl ?? null;
  }

  if (isVideoResultNode(node)) {
    const selectedVariant =
      node.data.variants[node.data.selectedVariantIndex]
      ?? node.data.variants[0]
      ?? null;
    return selectedVariant?.thumbnailRef ?? null;
  }

  if (isSceneComposerNode(node)) {
    return node.data.compositionImageUrl ?? null;
  }

  return null;
}
