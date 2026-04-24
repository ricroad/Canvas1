import {
  isSceneComposerNode,
  type CanvasEdge,
  type CanvasNode,
} from '../domain/canvasNodes';
import type { GraphPromptResolver } from './ports';

export class DefaultGraphPromptResolver implements GraphPromptResolver {
  collectInputPrompts(nodeId: string, nodes: CanvasNode[], edges: CanvasEdge[]): string[] {
    void nodeId;
    void nodes;
    void edges;
    return [];
  }

  collectUpstreamCompositionPrompt(
    nodeId: string,
    nodes: CanvasNode[],
    edges: CanvasEdge[],
  ): string | null {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const sourceNodeIds = edges
      .filter((edge) => edge.target === nodeId)
      .map((edge) => edge.source);

    for (const sourceId of sourceNodeIds) {
      const node = nodeById.get(sourceId);
      if (node && isSceneComposerNode(node) && node.data.compositionPrompt) {
        return node.data.compositionPrompt;
      }
    }
    return null;
  }
}
