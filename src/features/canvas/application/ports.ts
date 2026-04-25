import type { XYPosition } from '@xyflow/react';

import type {
  CanvasEdge,
  CanvasNode,
  CanvasNodeData,
  CanvasNodeType,
  NodeToolType,
  StoryboardFrameItem,
} from '../domain/canvasNodes';
import type { CanvasNodeDefinition } from '../domain/nodeRegistry';

export interface IdGenerator {
  next: () => string;
}

export interface NodeCatalog {
  getDefinition: (type: CanvasNodeType) => CanvasNodeDefinition;
  getMenuDefinitions: () => CanvasNodeDefinition[];
}

export interface NodeFactory {
  createNode: (
    type: CanvasNodeType,
    position: XYPosition,
    data?: Partial<CanvasNodeData>
  ) => CanvasNode;
}

export interface GraphImageResolver {
  collectInputImages: (nodeId: string, nodes: CanvasNode[], edges: CanvasEdge[]) => string[];
}

export interface GraphPromptResolver {
  collectInputPrompts: (nodeId: string, nodes: CanvasNode[], edges: CanvasEdge[]) => string[];
  collectUpstreamCompositionPrompt: (nodeId: string, nodes: CanvasNode[], edges: CanvasEdge[]) => string | null;
}

export interface GenerateImagePayload {
  prompt: string;
  model: string;
  size: string;
  aspectRatio: string;
  referenceImages?: string[];
  extraParams?: Record<string, unknown>;
  outputCount?: number;
}

export interface SubmitVideoBatchPayload {
  nodeId: string;
  batchId: string;
  modelId: string;
  prompt: string;
  negativePrompt?: string;
  duration: number;
  aspectRatio: string;
  extraParams?: Record<string, unknown>;
  providerConfig?: Record<string, unknown>;
  firstFrameRef: string;
  tailFrameRef?: string;
  outputCount: number;
  accessKey: string;
  secretKey: string;
}

export interface TestKlingConnectionPayload {
  accessKey: string;
  secretKey: string;
}

export interface AiGateway {
  setApiKey: (provider: string, apiKey: string) => Promise<void>;
  generateImage: (payload: GenerateImagePayload) => Promise<string>;
  submitGenerateImageJob: (payload: GenerateImagePayload) => Promise<string>;
  getGenerateImageJob: (jobId: string) => Promise<{
    job_id: string;
    status: 'queued' | 'running' | 'succeeded' | 'failed' | 'not_found';
    result?: string | null;
    error?: string | null;
  }>;
  testKlingConnection: (payload: TestKlingConnectionPayload) => Promise<void>;
  submitVideoBatch: (payload: SubmitVideoBatchPayload) => Promise<{
    batchId: string;
    subTasks: Array<{ subTaskId: string; variantId: string; klingTaskId: string }>;
  }>;
  cancelVideoBatch: (payload: { nodeId: string; batchId: string }) => Promise<void>;
}

export interface ImageSplitGateway {
  split: (
    imageSource: string,
    rows: number,
    cols: number,
    lineThickness: number
  ) => Promise<string[]>;
}

export interface ToolProcessorResult {
  outputImageUrl?: string;
  storyboardFrames?: StoryboardFrameItem[];
  rows?: number;
  cols?: number;
  frameAspectRatio?: string;
}

export interface ToolProcessor {
  process: (
    toolType: NodeToolType,
    sourceImageUrl: string,
    options: Record<string, unknown>
  ) => Promise<ToolProcessorResult>;
}

export interface CanvasEventMap {
  'canvas/auto-layout': undefined;
  'focus/node': {
    nodeId: string;
  };
  'tool-dialog/open': {
    nodeId: string;
    toolType: NodeToolType;
  };
  'tool-dialog/close': undefined;
  'upload-node/reupload': {
    nodeId: string;
  };
  'upload-node/paste-image': {
    nodeId: string;
    file: File;
  };
  'generation-node/run': {
    nodeId: string;
  };
}

export interface CanvasEventBus {
  publish: <TType extends keyof CanvasEventMap>(
    type: TType,
    payload: CanvasEventMap[TType]
  ) => void;
  subscribe: <TType extends keyof CanvasEventMap>(
    type: TType,
    handler: (payload: CanvasEventMap[TType]) => void
  ) => () => void;
}
