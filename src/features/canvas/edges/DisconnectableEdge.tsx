import { memo, useMemo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  Position,
  type EdgeProps,
} from '@xyflow/react';

import { CANVAS_NODE_TYPES } from '@/features/canvas/domain/canvasNodes';
import { useCanvasStore } from '@/stores/canvasStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { buildOrthogonalRoute } from './edgeRouting';
import { getCanvasNodeRect, resolveAnchorToNodeEdge } from './edgeAnchors';

export const DisconnectableEdge = memo(function DisconnectableEdge(props: EdgeProps) {
  const {
    id,
    source,
    target,
    selected,
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    markerEnd,
    style,
  } = props;
  const deleteEdge = useCanvasStore((state) => state.deleteEdge);
  const nodes = useCanvasStore((state) => state.nodes);
  const canvasEdgeRoutingMode = useSettingsStore((state) => state.canvasEdgeRoutingMode);
  const sourceNode = nodes.find((node) => node.id === source);
  const targetNode = nodes.find((node) => node.id === target);

  const anchoredSource = useMemo(
    () => resolveAnchorToNodeEdge({ x: sourceX, y: sourceY }, sourcePosition, getCanvasNodeRect(sourceNode)),
    [sourceNode, sourcePosition, sourceX, sourceY]
  );
  const anchoredTarget = useMemo(
    () => resolveAnchorToNodeEdge({ x: targetX, y: targetY }, targetPosition, getCanvasNodeRect(targetNode)),
    [targetNode, targetPosition, targetX, targetY]
  );

  const { edgePath, labelX, labelY } = useMemo(() => {
    if (canvasEdgeRoutingMode === 'spline') {
      const [path, nextLabelX, nextLabelY] = getBezierPath({
        sourceX: anchoredSource.x,
        sourceY: anchoredSource.y,
        sourcePosition,
        targetX: anchoredTarget.x,
        targetY: anchoredTarget.y,
        targetPosition,
      });
      return {
        edgePath: path,
        labelX: nextLabelX,
        labelY: nextLabelY,
      };
    }

    const route = buildOrthogonalRoute({
      sourceId: source,
      targetId: target,
      sourceX: anchoredSource.x,
      sourceY: anchoredSource.y,
      sourcePosition: sourcePosition ?? Position.Right,
      targetX: anchoredTarget.x,
      targetY: anchoredTarget.y,
      targetPosition: targetPosition ?? Position.Left,
      nodes,
      smartAvoidance: canvasEdgeRoutingMode === 'smartOrthogonal',
    });
    return {
      edgePath: route.path,
      labelX: route.labelX,
      labelY: route.labelY,
    };
  }, [
    canvasEdgeRoutingMode,
    nodes,
    source,
    sourcePosition,
    anchoredSource.x,
    anchoredSource.y,
    target,
    targetPosition,
    anchoredTarget.x,
    anchoredTarget.y,
  ]);

  const isProcessingEdge = useMemo(() => {
    if (!sourceNode || !targetNode || targetNode.type !== CANVAS_NODE_TYPES.exportImage) {
      return false;
    }

    const isSupportedSource =
      sourceNode.type === CANVAS_NODE_TYPES.storyboardGen ||
      sourceNode.type === CANVAS_NODE_TYPES.imageEdit;
    if (!isSupportedSource) {
      return false;
    }

    const isTargetGenerating =
      (targetNode.data as { isGenerating?: boolean } | undefined)?.isGenerating === true;

    return isTargetGenerating;
  }, [nodes, source, target]);

  const processingStroke = 'rgb(var(--accent-rgb) / 0.94)';
  const processingDashStroke = 'rgb(var(--accent-rgb) / 1)';
  const baseStrokeWidth = isProcessingEdge
    ? (selected ? 2.7 : 2.2)
    : (selected ? 2.4 : 1.9);

  return (
    <>
      {isProcessingEdge && (
        <path
          d={edgePath}
          fill="none"
          stroke={processingDashStroke}
          strokeWidth={selected ? 2.5 : 2.1}
          strokeLinecap="round"
          strokeDasharray="8 10"
          className="canvas-processing-edge__flow"
          style={{ pointerEvents: 'none' }}
        />
      )}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: isProcessingEdge ? processingStroke : style?.stroke,
          strokeWidth: baseStrokeWidth,
          ...style,
        }}
      />
      {selected && (
        <EdgeLabelRenderer>
          <button
            type="button"
            className="nodrag nopan absolute flex h-6 w-6 items-center justify-center text-text-muted transition-colors hover:text-text-dark"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
            }}
            onClick={(event) => {
              event.stopPropagation();
              deleteEdge(id);
            }}
            aria-label="断开连线"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                fillRule="evenodd"
                d="M2 12C2 6.477 6.477 2 12 2s10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12m7.707-3.707a1 1 0 0 0-1.414 1.414L10.586 12l-2.293 2.293a1 1 0 1 0 1.414 1.414L12 13.414l2.293 2.293a1 1 0 0 0 1.414-1.414L13.414 12l2.293-2.293a1 1 0 0 0-1.414-1.414L12 10.586z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
