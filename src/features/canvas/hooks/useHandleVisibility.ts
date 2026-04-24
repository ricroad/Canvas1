import { useEffect } from 'react';

import type { CanvasEdge } from '@/features/canvas/domain/canvasNodes';

function markConnectedHandles(root: HTMLElement, edges: CanvasEdge[]) {
  root.querySelectorAll<HTMLElement>('.react-flow__handle').forEach((handle) => {
    handle.dataset.handleConnected = 'false';
  });

  const mark = (nodeId: string, handleId: string) => {
    const selector = `.react-flow__handle[data-nodeid="${nodeId}"][data-handleid="${handleId}"]`;
    root.querySelectorAll<HTMLElement>(selector).forEach((handle) => {
      handle.dataset.handleConnected = 'true';
    });
  };

  for (const edge of edges) {
    mark(edge.source, edge.sourceHandle ?? 'source');
    mark(edge.target, edge.targetHandle ?? 'target');
  }
}

export function useHandleVisibility(
  containerRef: React.RefObject<HTMLElement | null>,
  edges: CanvasEdge[]
) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    markConnectedHandles(container, edges);
  }, [containerRef, edges]);
}
