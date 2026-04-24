import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
  type ExportImageNodeData,
  type ImageEditNodeData,
  type ImageResultNodeData,
  type SceneComposerNodeData,
  type StoryboardGenNodeData,
  type StoryboardSplitNodeData,
  type UploadImageNodeData,
  type VideoResultNodeData,
} from '@/features/canvas/domain/canvasNodes';
import { resolveImageDisplayUrl } from '@/features/canvas/application/imageData';

import type { AssetCategory } from './assetLibraryStore';

export type AssetKind = 'image' | 'video';

export interface AssetItem {
  id: string;
  nodeId: string;
  category: Exclude<AssetCategory, 'all'>;
  thumbnailUrl: string;
  sourceUrl: string;
  kind: AssetKind;
  createdAt?: number;
  suggestedFileName: string;
}

function pushImageAsset(
  assets: AssetItem[],
  input: {
    id: string;
    nodeId: string;
    category: AssetItem['category'];
    sourceUrl: string | null | undefined;
    thumbnailUrl?: string | null;
    createdAt?: number;
    suggestedFileName: string;
  }
) {
  if (!input.sourceUrl) return;

  const rawThumbnail = input.thumbnailUrl ?? input.sourceUrl;
  assets.push({
    id: input.id,
    nodeId: input.nodeId,
    category: input.category,
    thumbnailUrl: resolveImageDisplayUrl(rawThumbnail),
    sourceUrl: input.sourceUrl,
    kind: 'image',
    createdAt: input.createdAt,
    suggestedFileName: input.suggestedFileName,
  });
}

export function scanAssets(nodes: CanvasNode[]): AssetItem[] {
  const assets: AssetItem[] = [];

  for (const node of nodes) {
    switch (node.type) {
      case CANVAS_NODE_TYPES.upload: {
        const data = node.data as UploadImageNodeData;
        pushImageAsset(assets, {
          id: `${node.id}:upload`,
          nodeId: node.id,
          category: 'uploadedImage',
          sourceUrl: data.imageUrl,
          thumbnailUrl: data.previewImageUrl,
          suggestedFileName: data.sourceFileName ?? `${node.id}-upload`,
        });
        break;
      }

      case CANVAS_NODE_TYPES.imageResult: {
        const data = node.data as ImageResultNodeData;
        data.variants.forEach((variant, index) => {
          pushImageAsset(assets, {
            id: `${node.id}:variant:${variant.variantId}`,
            nodeId: node.id,
            category: 'generatedImage',
            sourceUrl: variant.imageUrl,
            createdAt: variant.createdAt,
            suggestedFileName: `${node.id}-image-${index + 1}`,
          });
        });
        break;
      }

      case CANVAS_NODE_TYPES.imageEdit: {
        const data = node.data as ImageEditNodeData;
        pushImageAsset(assets, {
          id: `${node.id}:image-edit`,
          nodeId: node.id,
          category: 'generatedImage',
          sourceUrl: data.imageUrl,
          thumbnailUrl: data.previewImageUrl,
          createdAt: data.generationStartedAt ?? undefined,
          suggestedFileName: `${node.id}-image-edit`,
        });
        break;
      }

      case CANVAS_NODE_TYPES.videoResult: {
        const data = node.data as VideoResultNodeData;
        data.variants.forEach((variant, index) => {
          if (!variant.videoRef) return;
          assets.push({
            id: `${node.id}:variant:${variant.variantId}`,
            nodeId: node.id,
            category: 'generatedVideo',
            thumbnailUrl: variant.thumbnailRef ? resolveImageDisplayUrl(variant.thumbnailRef) : '',
            sourceUrl: variant.videoRef,
            kind: 'video',
            createdAt: variant.generatedAt,
            suggestedFileName: `${node.id}-video-${index + 1}`,
          });
        });
        break;
      }

      case CANVAS_NODE_TYPES.storyboardSplit: {
        const data = node.data as StoryboardSplitNodeData;
        data.frames.forEach((frame, index) => {
          pushImageAsset(assets, {
            id: `${node.id}:frame:${frame.id}`,
            nodeId: node.id,
            category: 'storyboard',
            sourceUrl: frame.imageUrl,
            thumbnailUrl: frame.previewImageUrl,
            suggestedFileName: `${node.id}-storyboard-${frame.order || index + 1}`,
          });
        });
        break;
      }

      case CANVAS_NODE_TYPES.storyboardGen: {
        const data = node.data as StoryboardGenNodeData;
        pushImageAsset(assets, {
          id: `${node.id}:storyboard-gen`,
          nodeId: node.id,
          category: 'storyboard',
          sourceUrl: data.imageUrl,
          thumbnailUrl: data.previewImageUrl,
          createdAt: data.generationStartedAt ?? undefined,
          suggestedFileName: `${node.id}-storyboard`,
        });
        break;
      }

      case CANVAS_NODE_TYPES.sceneComposer: {
        const data = node.data as SceneComposerNodeData;
        pushImageAsset(assets, {
          id: `${node.id}:composition`,
          nodeId: node.id,
          category: 'generatedImage',
          sourceUrl: data.compositionImageUrl,
          suggestedFileName: `${node.id}-composition`,
        });
        break;
      }

      case CANVAS_NODE_TYPES.exportImage: {
        const data = node.data as ExportImageNodeData;
        pushImageAsset(assets, {
          id: `${node.id}:export`,
          nodeId: node.id,
          category: data.resultKind?.startsWith('storyboard') ? 'storyboard' : 'generatedImage',
          sourceUrl: data.imageUrl,
          thumbnailUrl: data.previewImageUrl,
          suggestedFileName: `${node.id}-image`,
        });
        break;
      }

      default:
        break;
    }
  }

  return assets;
}
