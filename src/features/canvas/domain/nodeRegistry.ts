import {
  AUTO_REQUEST_ASPECT_RATIO,
  CANVAS_NODE_TYPES,
  DEFAULT_ASPECT_RATIO,
  type CanvasNodeData,
  type CanvasNodeType,
  type ExportImageNodeData,
  type GroupNodeData,
  type ImageEditNodeData,
  type ImageResultNodeData,
  type ImageSize,
  type SceneComposerNodeData,
  type StoryboardGenNodeData,
  type StoryboardSplitNodeData,
  type TextAnnotationNodeData,
  type UploadImageNodeData,
  type VideoGenNodeData,
  type VideoResultNodeData,
} from './canvasNodes';
import { DEFAULT_IMAGE_MODEL_ID, DEFAULT_VIDEO_MODEL_ID } from '../models';
import { DEFAULT_NODE_DISPLAY_NAME } from './nodeDisplay';

export type MenuIconKey = 'upload' | 'sparkles' | 'layout' | 'text';

export interface CanvasNodeCapabilities {
  toolbar: boolean;
  promptInput: boolean;
}

export interface CanvasNodeConnectivity {
  sourceHandle: boolean;
  targetHandle: boolean;
  manualConnectionSource: boolean;
  connectMenu: {
    fromSource: boolean;
    fromTarget: boolean;
  };
}

export interface CanvasNodeDefinition<TData extends CanvasNodeData = CanvasNodeData> {
  type: CanvasNodeType;
  menuLabelKey: string;
  menuIcon: MenuIconKey;
  visibleInMenu: boolean;
  capabilities: CanvasNodeCapabilities;
  connectivity: CanvasNodeConnectivity;
  createDefaultData: () => TData;
  purifyForTemplate?: (data: TData) => Partial<TData> | null;
}

const uploadNodeDefinition: CanvasNodeDefinition<UploadImageNodeData> = {
  type: CANVAS_NODE_TYPES.upload,
  menuLabelKey: 'node.menu.uploadImage',
  menuIcon: 'upload',
  visibleInMenu: true,
  capabilities: {
    toolbar: true,
    promptInput: false,
  },
  connectivity: {
    sourceHandle: true,
    targetHandle: false,
    manualConnectionSource: true,
    connectMenu: {
      fromSource: false,
      fromTarget: true,
    },
  },
  createDefaultData: () => ({
    displayName: DEFAULT_NODE_DISPLAY_NAME[CANVAS_NODE_TYPES.upload],
    imageUrl: null,
    previewImageUrl: null,
    aspectRatio: '1:1',
    isSizeManuallyAdjusted: false,
    sourceFileName: null,
  }),
  purifyForTemplate: (data) => ({
    displayName: data.displayName,
    imageUrl: data.imageUrl,
    previewImageUrl: data.previewImageUrl ?? null,
    aspectRatio: data.aspectRatio,
    isSizeManuallyAdjusted: data.isSizeManuallyAdjusted ?? false,
    sourceFileName: data.sourceFileName ?? null,
  }),
};

const imageEditNodeDefinition: CanvasNodeDefinition<ImageEditNodeData> = {
  type: CANVAS_NODE_TYPES.imageEdit,
  menuLabelKey: 'node.menu.aiImageGeneration',
  menuIcon: 'sparkles',
  visibleInMenu: true,
  capabilities: {
    toolbar: true,
    promptInput: false,
  },
  connectivity: {
    sourceHandle: true,
    targetHandle: true,
    manualConnectionSource: true,
    connectMenu: {
      fromSource: true,
      fromTarget: false,
    },
  },
  createDefaultData: () => ({
    displayName: DEFAULT_NODE_DISPLAY_NAME[CANVAS_NODE_TYPES.imageEdit],
    imageUrl: null,
    previewImageUrl: null,
    aspectRatio: DEFAULT_ASPECT_RATIO,
    isSizeManuallyAdjusted: false,
    requestAspectRatio: AUTO_REQUEST_ASPECT_RATIO,
    prompt: '',
    model: DEFAULT_IMAGE_MODEL_ID,
    size: '2K' as ImageSize,
    extraParams: {},
    isGenerating: false,
    generationStartedAt: null,
    generationDurationMs: 60000,
    outputCount: 4,
    generatedResultNodeIds: [],
    currentBatch: undefined,
    derivedFrom: undefined,
  }),
  purifyForTemplate: (data) => ({
    displayName: data.displayName,
    imageUrl: null,
    previewImageUrl: null,
    aspectRatio: data.aspectRatio,
    isSizeManuallyAdjusted: data.isSizeManuallyAdjusted ?? false,
    requestAspectRatio: data.requestAspectRatio ?? AUTO_REQUEST_ASPECT_RATIO,
    prompt: data.prompt,
    model: data.model,
    size: data.size,
    extraParams: data.extraParams ?? {},
    isGenerating: false,
    generationStartedAt: null,
    generationDurationMs: data.generationDurationMs ?? 60000,
    outputCount: data.outputCount ?? 4,
    generatedResultNodeIds: [],
    currentBatch: undefined,
    derivedFrom: undefined,
  }),
};

const exportImageNodeDefinition: CanvasNodeDefinition<ExportImageNodeData> = {
  type: CANVAS_NODE_TYPES.exportImage,
  menuLabelKey: 'node.menu.uploadImage',
  menuIcon: 'upload',
  visibleInMenu: false,
  capabilities: {
    toolbar: true,
    promptInput: false,
  },
  connectivity: {
    sourceHandle: true,
    targetHandle: true,
    manualConnectionSource: true,
    connectMenu: {
      fromSource: false,
      fromTarget: false,
    },
  },
  createDefaultData: () => ({
    displayName: DEFAULT_NODE_DISPLAY_NAME[CANVAS_NODE_TYPES.exportImage],
    imageUrl: null,
    previewImageUrl: null,
    aspectRatio: DEFAULT_ASPECT_RATIO,
    isSizeManuallyAdjusted: false,
    resultKind: 'generic',
  }),
  purifyForTemplate: (data) => ({
    displayName: data.displayName,
    imageUrl: null,
    previewImageUrl: null,
    aspectRatio: data.aspectRatio,
    isSizeManuallyAdjusted: data.isSizeManuallyAdjusted ?? false,
    resultKind: data.resultKind ?? 'generic',
  }),
};

const groupNodeDefinition: CanvasNodeDefinition<GroupNodeData> = {
  type: CANVAS_NODE_TYPES.group,
  menuLabelKey: 'node.menu.storyboard',
  menuIcon: 'layout',
  visibleInMenu: false,
  capabilities: {
    toolbar: false,
    promptInput: false,
  },
  connectivity: {
    sourceHandle: false,
    targetHandle: false,
    manualConnectionSource: false,
    connectMenu: {
      fromSource: false,
      fromTarget: false,
    },
  },
  createDefaultData: () => ({
    displayName: DEFAULT_NODE_DISPLAY_NAME[CANVAS_NODE_TYPES.group],
    label: 'Group',
  }),
  purifyForTemplate: (data) => ({
    displayName: data.displayName,
    label: data.label,
  }),
};

const textAnnotationNodeDefinition: CanvasNodeDefinition<TextAnnotationNodeData> = {
  type: CANVAS_NODE_TYPES.textAnnotation,
  menuLabelKey: 'node.menu.textAnnotation',
  menuIcon: 'text',
  visibleInMenu: true,
  capabilities: {
    toolbar: true,
    promptInput: false,
  },
  connectivity: {
    sourceHandle: false,
    targetHandle: false,
    manualConnectionSource: false,
    connectMenu: {
      fromSource: false,
      fromTarget: false,
    },
  },
  createDefaultData: () => ({
    displayName: DEFAULT_NODE_DISPLAY_NAME[CANVAS_NODE_TYPES.textAnnotation],
    content: '',
  }),
  purifyForTemplate: (data) => ({
    displayName: data.displayName,
    content: data.content,
  }),
};

const storyboardSplitDefinition: CanvasNodeDefinition<StoryboardSplitNodeData> = {
  type: CANVAS_NODE_TYPES.storyboardSplit,
  menuLabelKey: 'node.menu.storyboard',
  menuIcon: 'layout',
  visibleInMenu: false,
  capabilities: {
    toolbar: false,
    promptInput: false,
  },
  connectivity: {
    sourceHandle: true,
    targetHandle: true,
    manualConnectionSource: true,
    connectMenu: {
      fromSource: false,
      fromTarget: false,
    },
  },
  createDefaultData: () => ({
    displayName: DEFAULT_NODE_DISPLAY_NAME[CANVAS_NODE_TYPES.storyboardSplit],
    aspectRatio: DEFAULT_ASPECT_RATIO,
    frameAspectRatio: DEFAULT_ASPECT_RATIO,
    gridRows: 2,
    gridCols: 2,
    frames: [],
    exportOptions: {
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
    },
  }),
  purifyForTemplate: (data) => ({
    displayName: data.displayName,
    aspectRatio: data.aspectRatio,
    frameAspectRatio: data.frameAspectRatio ?? data.aspectRatio,
    gridRows: data.gridRows,
    gridCols: data.gridCols,
    frames: data.frames.map((frame) => ({
      ...frame,
      imageUrl: frame.imageUrl,
      previewImageUrl: frame.previewImageUrl ?? null,
    })),
    exportOptions: data.exportOptions
      ? { ...data.exportOptions }
      : undefined,
  }),
};

const storyboardGenNodeDefinition: CanvasNodeDefinition<StoryboardGenNodeData> = {
  type: CANVAS_NODE_TYPES.storyboardGen,
  menuLabelKey: 'node.menu.storyboardGen',
  menuIcon: 'sparkles',
  visibleInMenu: true,
  capabilities: {
    toolbar: true,
    promptInput: false,
  },
  connectivity: {
    sourceHandle: true,
    targetHandle: true,
    manualConnectionSource: true,
    connectMenu: {
      fromSource: true,
      fromTarget: false,
    },
  },
  createDefaultData: () => ({
    displayName: DEFAULT_NODE_DISPLAY_NAME[CANVAS_NODE_TYPES.storyboardGen],
    gridRows: 2,
    gridCols: 2,
    frames: [],
    ratioControlMode: 'cell',
    model: DEFAULT_IMAGE_MODEL_ID,
    size: '2K' as ImageSize,
    requestAspectRatio: AUTO_REQUEST_ASPECT_RATIO,
    extraParams: {},
    imageUrl: null,
    previewImageUrl: null,
    aspectRatio: DEFAULT_ASPECT_RATIO,
    isGenerating: false,
    generationStartedAt: null,
    generationDurationMs: 60000,
    derivedFrom: undefined,
  }),
  purifyForTemplate: (data) => ({
    displayName: data.displayName,
    gridRows: data.gridRows,
    gridCols: data.gridCols,
    frames: data.frames.map((frame) => ({ ...frame })),
    ratioControlMode: data.ratioControlMode ?? 'cell',
    model: data.model,
    size: data.size,
    requestAspectRatio: data.requestAspectRatio,
    extraParams: data.extraParams ?? {},
    imageUrl: null,
    previewImageUrl: null,
    aspectRatio: data.aspectRatio,
    isGenerating: false,
    generationStartedAt: null,
    generationDurationMs: data.generationDurationMs ?? 60000,
    derivedFrom: undefined,
  }),
};

const sceneComposerNodeDefinition: CanvasNodeDefinition<SceneComposerNodeData> = {
  type: CANVAS_NODE_TYPES.sceneComposer,
  menuLabelKey: 'node.menu.sceneComposer',
  menuIcon: 'layout',
  visibleInMenu: true,
  capabilities: {
    toolbar: false,
    promptInput: false,
  },
  connectivity: {
    sourceHandle: true,
    targetHandle: true,
    manualConnectionSource: true,
    connectMenu: {
      fromSource: true,
      fromTarget: false,
    },
  },
  createDefaultData: () => ({
    displayName: DEFAULT_NODE_DISPLAY_NAME[CANVAS_NODE_TYPES.sceneComposer],
    compositionImageUrl: null,
    sceneJson: null,
    compositionPrompt: null,
  }),
  purifyForTemplate: (data) => ({
    displayName: data.displayName,
    inputImageUrl: data.inputImageUrl ?? null,
    compositionImageUrl: null,
    sceneJson: null,
    compositionPrompt: null,
  }),
};

const videoGenNodeDefinition: CanvasNodeDefinition<VideoGenNodeData> = {
  type: CANVAS_NODE_TYPES.videoGen,
  menuLabelKey: 'node.menu.videoGeneration',
  menuIcon: 'sparkles',
  visibleInMenu: true,
  capabilities: {
    toolbar: true,
    promptInput: true,
  },
  connectivity: {
    sourceHandle: true,
    targetHandle: true,
    manualConnectionSource: false,
    connectMenu: {
      fromSource: true,
      fromTarget: true,
    },
  },
  createDefaultData: () => ({
    displayName: DEFAULT_NODE_DISPLAY_NAME[CANVAS_NODE_TYPES.videoGen],
    modelId: DEFAULT_VIDEO_MODEL_ID,
    prompt: '',
    negativePrompt: '',
    duration: 5,
    aspectRatio: '16:9',
    extraParams: {
      mode: 'pro',
    },
    outputCount: 1,
    derivedFrom: undefined,
    generatedResultNodeIds: [],
  }),
  purifyForTemplate: (data) => ({
    displayName: data.displayName,
    modelId: data.modelId,
    prompt: data.prompt,
    negativePrompt: data.negativePrompt,
    duration: data.duration,
    aspectRatio: data.aspectRatio,
    extraParams: data.extraParams ?? {},
    outputCount: data.outputCount,
    derivedFrom: undefined,
    generatedResultNodeIds: [],
  }),
};

const videoResultNodeDefinition: CanvasNodeDefinition<VideoResultNodeData> = {
  type: CANVAS_NODE_TYPES.videoResult,
  menuLabelKey: 'node.menu.videoGeneration',
  menuIcon: 'sparkles',
  visibleInMenu: false,
  capabilities: {
    toolbar: true,
    promptInput: false,
  },
  connectivity: {
    sourceHandle: true,
    targetHandle: true,
    manualConnectionSource: true,
    connectMenu: {
      fromSource: true,
      fromTarget: false,
    },
  },
  createDefaultData: () => {
    throw new Error('VideoResultNode cannot be created manually');
  },
  purifyForTemplate: () => null,
};

const imageResultNodeDefinition: CanvasNodeDefinition<ImageResultNodeData> = {
  type: CANVAS_NODE_TYPES.imageResult,
  menuLabelKey: 'node.menu.aiImageGeneration',
  menuIcon: 'sparkles',
  visibleInMenu: false,
  capabilities: {
    toolbar: true,
    promptInput: false,
  },
  connectivity: {
    sourceHandle: true,
    targetHandle: true,
    manualConnectionSource: true,
    connectMenu: {
      fromSource: true,
      fromTarget: false,
    },
  },
  createDefaultData: () => ({
    displayName: 'Image Result',
    sourceGenNodeId: '',
    batchId: '',
    batchCreatedAt: Date.now(),
    snapshotParams: {},
    variants: [],
    selectedVariantIndex: 0,
  }),
  purifyForTemplate: () => null,
};

export const canvasNodeDefinitions: Record<CanvasNodeType, CanvasNodeDefinition<any>> = {
  [CANVAS_NODE_TYPES.upload]: uploadNodeDefinition,
  [CANVAS_NODE_TYPES.imageEdit]: imageEditNodeDefinition,
  [CANVAS_NODE_TYPES.imageResult]: imageResultNodeDefinition,
  [CANVAS_NODE_TYPES.exportImage]: exportImageNodeDefinition,
  [CANVAS_NODE_TYPES.textAnnotation]: textAnnotationNodeDefinition,
  [CANVAS_NODE_TYPES.group]: groupNodeDefinition,
  [CANVAS_NODE_TYPES.storyboardSplit]: storyboardSplitDefinition,
  [CANVAS_NODE_TYPES.storyboardGen]: storyboardGenNodeDefinition,
  [CANVAS_NODE_TYPES.sceneComposer]: sceneComposerNodeDefinition,
  [CANVAS_NODE_TYPES.videoGen]: videoGenNodeDefinition,
  [CANVAS_NODE_TYPES.videoResult]: videoResultNodeDefinition,
};

export function getNodeDefinition(type: CanvasNodeType): CanvasNodeDefinition {
  return canvasNodeDefinitions[type] as CanvasNodeDefinition;
}

export function getMenuNodeDefinitions(): CanvasNodeDefinition[] {
  return Object.values(canvasNodeDefinitions).filter((definition) => definition.visibleInMenu);
}

export function nodeHasSourceHandle(type: CanvasNodeType): boolean {
  return canvasNodeDefinitions[type].connectivity.sourceHandle;
}

export function nodeHasTargetHandle(type: CanvasNodeType): boolean {
  return canvasNodeDefinitions[type].connectivity.targetHandle;
}

export function nodeCanStartManualConnection(type: CanvasNodeType): boolean {
  return canvasNodeDefinitions[type].connectivity.manualConnectionSource;
}

export function getConnectMenuNodeTypes(handleType: 'source' | 'target'): CanvasNodeType[] {
  const fromSource = handleType === 'source';
  return Object.values(canvasNodeDefinitions)
    .filter((definition) => definition.visibleInMenu)
    .filter((definition) => (fromSource
      ? definition.connectivity.connectMenu.fromSource
      : definition.connectivity.connectMenu.fromTarget))
    .filter((definition) => (fromSource
      ? definition.connectivity.targetHandle
      : definition.connectivity.sourceHandle))
    .map((definition) => definition.type);
}

export function purifyNodeDataForTemplate<TData extends CanvasNodeData>(
  type: CanvasNodeType,
  data: TData
): Partial<TData> | null {
  const definition = canvasNodeDefinitions[type] as unknown as CanvasNodeDefinition<TData>;
  return typeof definition.purifyForTemplate === 'function'
    ? definition.purifyForTemplate(data)
    : data;
}
