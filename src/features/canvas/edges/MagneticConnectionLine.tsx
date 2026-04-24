import { getBezierPath, type ConnectionLineComponentProps } from '@xyflow/react';

import { getInternalNodeRect, resolveAnchorToNodeEdge } from './edgeAnchors';

export function MagneticConnectionLine(props: ConnectionLineComponentProps) {
  const anchoredFrom = resolveAnchorToNodeEdge(
    { x: props.fromX, y: props.fromY },
    props.fromPosition,
    getInternalNodeRect(props.fromNode)
  );
  const anchoredTo = resolveAnchorToNodeEdge(
    { x: props.toX, y: props.toY },
    props.toPosition,
    getInternalNodeRect(props.toNode)
  );

  const [path] = getBezierPath({
    sourceX: anchoredFrom.x,
    sourceY: anchoredFrom.y,
    sourcePosition: props.fromPosition,
    targetX: anchoredTo.x,
    targetY: anchoredTo.y,
    targetPosition: props.toPosition,
  });

  const stroke =
    props.connectionStatus === 'valid'
      ? 'rgba(16, 185, 129, 0.95)'
      : props.connectionStatus === 'invalid'
        ? 'rgba(239, 68, 68, 0.92)'
        : 'rgb(var(--accent-rgb) / 0.94)';

  return (
    <path
      d={path}
      fill="none"
      stroke={stroke}
      strokeWidth={2}
      strokeLinecap="round"
      style={props.connectionLineStyle}
    />
  );
}
