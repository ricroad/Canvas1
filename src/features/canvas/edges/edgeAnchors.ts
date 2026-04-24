import { Position, type InternalNode, type Node } from '@xyflow/react';

import { DEFAULT_NODE_WIDTH, type CanvasNode } from '@/features/canvas/domain/canvasNodes';

interface RectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

function resolveNumericDimension(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function resolveRectSize(candidate: {
  measured?: { width?: number; height?: number };
  width?: number;
  height?: number;
  style?: { width?: unknown; height?: unknown };
}): { width: number; height: number } {
  const width =
    resolveNumericDimension(candidate.measured?.width)
    ?? resolveNumericDimension(candidate.width)
    ?? resolveNumericDimension(candidate.style?.width)
    ?? DEFAULT_NODE_WIDTH;
  const height =
    resolveNumericDimension(candidate.measured?.height)
    ?? resolveNumericDimension(candidate.height)
    ?? resolveNumericDimension(candidate.style?.height)
    ?? 200;

  return { width, height };
}

export function getCanvasNodeRect(node: CanvasNode | null | undefined): RectLike | null {
  if (!node) {
    return null;
  }

  const size = resolveRectSize(node);
  return {
    x: node.position.x,
    y: node.position.y,
    width: size.width,
    height: size.height,
  };
}

export function getInternalNodeRect(
  node: InternalNode<Node> | null | undefined
): RectLike | null {
  if (!node) {
    return null;
  }

  const size = resolveRectSize(node);
  return {
    x: node.internals.positionAbsolute.x,
    y: node.internals.positionAbsolute.y,
    width: size.width,
    height: size.height,
  };
}

export function resolveAnchorToNodeEdge(
  point: { x: number; y: number },
  position: Position | undefined,
  rect: RectLike | null
): { x: number; y: number } {
  if (!rect || !position) {
    return point;
  }

  switch (position) {
    case Position.Left:
      return { x: rect.x, y: point.y };
    case Position.Right:
      return { x: rect.x + rect.width, y: point.y };
    case Position.Top:
      return { x: point.x, y: rect.y };
    case Position.Bottom:
      return { x: point.x, y: rect.y + rect.height };
    default:
      return point;
  }
}
