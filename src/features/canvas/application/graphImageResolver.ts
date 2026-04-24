import {
  getNodePrimaryImageUrl,
  isExportImageNode,
  isSceneComposerNode,
  isUploadNode,
  type CanvasEdge,
  type CanvasNode,
} from '../domain/canvasNodes';
import type { GraphImageResolver } from './ports';

export class DefaultGraphImageResolver implements GraphImageResolver {
  collectInputImages(nodeId: string, nodes: CanvasNode[], edges: CanvasEdge[]): string[] {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const sourceNodeIds = edges
      .filter((edge) => edge.target === nodeId)
      .map((edge) => edge.source);

    const images = sourceNodeIds
      .map((sourceId) => nodeById.get(sourceId))
      .flatMap((node) => this.extractImages(node));

    return [...new Set(images)];
  }

  private extractImages(node: CanvasNode | undefined): string[] {
    if (!node) {
      return [];
    }

    if (isUploadNode(node) || isExportImageNode(node)) {
      return node.data.imageUrl ? [node.data.imageUrl] : [];
    }

    if (isSceneComposerNode(node)) {
      const images: string[] = [];
      if (node.data.inputImageUrl) {
        images.push(node.data.inputImageUrl);
      }
      if (node.data.compositionImageUrl) {
        images.push(node.data.compositionImageUrl);
      }
      return images;
    }

    const primaryImageUrl = getNodePrimaryImageUrl(node);
    if (primaryImageUrl) {
      return [primaryImageUrl];
    }

    return [];
  }
}
