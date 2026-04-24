import {
  createContext,
  memo,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type PropsWithChildren,
} from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position } from '@xyflow/react';

export const PORT_CONFIG = {
  // ======== 视觉 ========
  VISUAL_SIZE: 24,
  HIT_AREA_SIZE: 52,
  OVERFLOW_OFFSET: 26,
  PLUS_STROKE_WIDTH: 2,
  // ======== 节点 hover ========
  NODE_HOVER_BUFFER: 8,
  HOVER_DEBOUNCE: 120,
  LEAVE_DELAY: 50,
  // ======== 弹出动画 ========
  APPEAR_DURATION: 200,
  APPEAR_EASING: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  DISAPPEAR_DURATION: 150,
  DISAPPEAR_EASING: 'cubic-bezier(0.4, 0, 1, 1)',
  INITIAL_SCALE: 0.6,
  INITIAL_TRANSLATE_X: 4,
  // ======== 磁吸跟随 ========
  TRIGGER_RADIUS: 60,
  LOCK_RADIUS: 15,
  ACTIVE_NODE_RADIUS: 220,
  MAX_OFFSET: 14,
  FOLLOW_RATIO: 0.35,
  HOVER_SCALE: 1.25, // Keep in sync with .magnetic-handle__surface--hover in src/index.css.
  // ======== 回弹 ========
  SPRING: 0.15,
  FRICTION: 0.75,
  RELEASE_SETTLE_EPSILON: 0.12,
  // ======== 连线 ========
  DRAG_THRESHOLD: 3,
} as const;

type TargetPhase = 'idle' | 'sensing' | 'locked' | 'releasing';
type VisualState = 'idle' | 'hover' | 'dragging';

interface PointerClientPosition {
  x: number;
  y: number;
}

interface ActiveMagneticHandle {
  nodeId: string;
  handleType: 'source' | 'target';
  handleId: string | null;
}

interface MagneticConnectionContextValue {
  isConnecting: boolean;
  pointerRef: MutableRefObject<PointerClientPosition | null>;
  activeHandle: ActiveMagneticHandle | null;
}

const MagneticConnectionContext = createContext<MagneticConnectionContextValue | null>(null);

export function MagneticConnectionProvider({
  children,
  isConnecting,
  pointerRef,
  activeHandle,
}: PropsWithChildren<MagneticConnectionContextValue>) {
  const value = useMemo(
    () => ({
      isConnecting,
      pointerRef,
      activeHandle,
    }),
    [activeHandle, isConnecting, pointerRef]
  );

  return (
    <MagneticConnectionContext.Provider value={value}>
      {children}
    </MagneticConnectionContext.Provider>
  );
}

function useMagneticConnectionContext(): MagneticConnectionContextValue {
  const context = useContext(MagneticConnectionContext);
  if (!context) {
    return {
      isConnecting: false,
      pointerRef: { current: null },
      activeHandle: null,
    };
  }
  return context;
}

type MagneticHandleProps = React.ComponentProps<typeof Handle>;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getNodeCenterDistance(pointer: PointerClientPosition, nodeRect: DOMRect): number {
  const centerX = nodeRect.left + nodeRect.width / 2;
  const centerY = nodeRect.top + nodeRect.height / 2;
  const dx = pointer.x - centerX;
  const dy = pointer.y - centerY;
  return Math.sqrt(dx * dx + dy * dy);
}

function isPointerWithinEdgeSensor(
  pointer: PointerClientPosition,
  nodeRect: DOMRect,
  position: Position
): boolean {
  const outer = PORT_CONFIG.HIT_AREA_SIZE / 2;
  const inner = PORT_CONFIG.HIT_AREA_SIZE / 2;

  switch (position) {
    case Position.Left:
      return (
        pointer.x >= nodeRect.left - outer
        && pointer.x <= nodeRect.left + inner
        && pointer.y >= nodeRect.top
        && pointer.y <= nodeRect.bottom
      );
    case Position.Right:
      return (
        pointer.x >= nodeRect.right - inner
        && pointer.x <= nodeRect.right + outer
        && pointer.y >= nodeRect.top
        && pointer.y <= nodeRect.bottom
      );
    case Position.Top:
      return (
        pointer.y >= nodeRect.top - outer
        && pointer.y <= nodeRect.top + inner
        && pointer.x >= nodeRect.left
        && pointer.x <= nodeRect.right
      );
    case Position.Bottom:
      return (
        pointer.y >= nodeRect.bottom - inner
        && pointer.y <= nodeRect.bottom + outer
        && pointer.x >= nodeRect.left
        && pointer.x <= nodeRect.right
      );
    default:
      return false;
  }
}

function resolveTargetOffset(
  pointer: PointerClientPosition,
  centerX: number,
  centerY: number
): { x: number; y: number; distance: number } {
  const dx = pointer.x - centerX;
  const dy = pointer.y - centerY;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance > PORT_CONFIG.TRIGGER_RADIUS) {
    return { x: 0, y: 0, distance };
  }

  return {
    x: clamp(dx * PORT_CONFIG.FOLLOW_RATIO, -PORT_CONFIG.MAX_OFFSET, PORT_CONFIG.MAX_OFFSET),
    y: clamp(dy * PORT_CONFIG.FOLLOW_RATIO, -PORT_CONFIG.MAX_OFFSET, PORT_CONFIG.MAX_OFFSET),
    distance,
  };
}

export const MagneticHandle = memo(({
  className,
  children,
  position = Position.Top,
  ...rest
}: MagneticHandleProps) => {
  const { isConnecting, pointerRef, activeHandle } = useMagneticConnectionContext();
  const handleRef = useRef<HTMLDivElement | null>(null);
  const visualRef = useRef<HTMLDivElement | null>(null);
  const visualStackRef = useRef<HTMLSpanElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const hoverDelayRef = useRef<number | null>(null);
  const leaveDelayRef = useRef<number | null>(null);
  const idlePointerRef = useRef<PointerClientPosition | null>(null);
  const currentRef = useRef({ x: 0, y: 0 });
  const velocityRef = useRef({ x: 0, y: 0 });
  const targetRef = useRef({ x: 0, y: 0 });
  const [ownerNodeId, setOwnerNodeId] = useState<string | null>(null);
  const [isNodeVisible, setIsNodeVisible] = useState(false);
  const [isHandleHovering, setIsHandleHovering] = useState(false);
  const [phase, setPhase] = useState<TargetPhase>('idle');
  const [isValidTarget, setIsValidTarget] = useState<boolean | null>(null);
  const handleId = typeof rest.id === 'string' ? rest.id : null;
  const handleType = rest.type ?? 'source';
  const isSourceHandle = handleType === 'source';

  useLayoutEffect(() => {
    const handleElement = handleRef.current;
    const nodeElement = handleElement?.closest('.react-flow__node[data-id]') as HTMLElement | null;
    setOwnerNodeId(nodeElement?.dataset.id ?? null);
  }, []);

  const isActiveSourceHandle =
    isConnecting
    && isSourceHandle
    && activeHandle?.handleType === 'source'
    && activeHandle.nodeId === ownerNodeId
    && (activeHandle.handleId ?? null) === handleId;

  const isConnectionCandidate =
    Boolean(
      isConnecting
      && activeHandle
      && !isActiveSourceHandle
      && (
        (activeHandle.handleType === 'source' && handleType === 'target')
        || (activeHandle.handleType === 'target' && handleType === 'source')
      )
    );

  useEffect(() => {
    const handleElement = handleRef.current;
    const nodeElement = handleElement?.closest('.react-flow__node[data-id]') as HTMLElement | null;
    if (!handleElement || !nodeElement) {
      return;
    }

    const revealNodePorts = () => {
      if (hoverDelayRef.current !== null) {
        window.clearTimeout(hoverDelayRef.current);
      }
      hoverDelayRef.current = window.setTimeout(() => {
        setIsNodeVisible(true);
        hoverDelayRef.current = null;
      }, PORT_CONFIG.HOVER_DEBOUNCE);
    };

    const hideNodePorts = () => {
      if (hoverDelayRef.current !== null) {
        window.clearTimeout(hoverDelayRef.current);
        hoverDelayRef.current = null;
      }
      if (leaveDelayRef.current !== null) {
        window.clearTimeout(leaveDelayRef.current);
      }
      leaveDelayRef.current = window.setTimeout(() => {
        setIsNodeVisible(false);
        setIsHandleHovering(false);
        leaveDelayRef.current = null;
      }, PORT_CONFIG.LEAVE_DELAY);
    };

    const handleEnter = () => {
      if (leaveDelayRef.current !== null) {
        window.clearTimeout(leaveDelayRef.current);
        leaveDelayRef.current = null;
      }
      setIsHandleHovering(true);
      setIsNodeVisible(true);
    };

    const handleLeave = () => {
      setIsHandleHovering(false);
    };

    nodeElement.addEventListener('pointerenter', revealNodePorts);
    nodeElement.addEventListener('pointermove', revealNodePorts);
    nodeElement.addEventListener('pointerleave', hideNodePorts);
    handleElement.addEventListener('pointerenter', handleEnter);
    handleElement.addEventListener('pointerleave', handleLeave);

    return () => {
      if (hoverDelayRef.current !== null) {
        window.clearTimeout(hoverDelayRef.current);
        hoverDelayRef.current = null;
      }
      if (leaveDelayRef.current !== null) {
        window.clearTimeout(leaveDelayRef.current);
        leaveDelayRef.current = null;
      }
      nodeElement.removeEventListener('pointerenter', revealNodePorts);
      nodeElement.removeEventListener('pointermove', revealNodePorts);
      nodeElement.removeEventListener('pointerleave', hideNodePorts);
      handleElement.removeEventListener('pointerenter', handleEnter);
      handleElement.removeEventListener('pointerleave', handleLeave);
    };
  }, [isConnecting]);

  useEffect(() => {
    const shouldTrackIdlePointer = isNodeVisible && !isConnecting;
    if (!shouldTrackIdlePointer) {
      idlePointerRef.current = null;
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      idlePointerRef.current = { x: event.clientX, y: event.clientY };
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      idlePointerRef.current = null;
    };
  }, [isConnecting, isNodeVisible]);

  useEffect(() => {
    const shouldAnimate = (isConnecting && isConnectionCandidate) || (isNodeVisible && !isConnecting);

    if (!shouldAnimate && phase === 'idle') {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      return;
    }

    const tick = () => {
      const handleElement = handleRef.current;
      const visualElement = visualRef.current;
      const inlineVisualStackElement = visualStackRef.current;
      const pointer =
        isConnecting && isConnectionCandidate
          ? pointerRef.current
          : idlePointerRef.current;
      const nodeElement = handleElement?.closest('.react-flow__node') as HTMLElement | null;

      if (!handleElement || !nodeElement) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }

      let nextPhase: TargetPhase = 'idle';
      let nextValidTarget: boolean | null = null;
      const shouldUseOverlay =
        isConnecting
        && isConnectionCandidate
        && (phase === 'sensing' || phase === 'locked' || phase === 'releasing');
      const centerRect =
        !shouldUseOverlay && inlineVisualStackElement
          ? inlineVisualStackElement.getBoundingClientRect()
          : handleElement.getBoundingClientRect();
      const centerX = centerRect.left + centerRect.width / 2;
      const centerY = centerRect.top + centerRect.height / 2;

      if (isConnecting && isConnectionCandidate && pointer) {
        const nodeRect = nodeElement.getBoundingClientRect();
        if (getNodeCenterDistance(pointer, nodeRect) <= PORT_CONFIG.ACTIVE_NODE_RADIUS) {
          const sensorActive = isPointerWithinEdgeSensor(pointer, nodeRect, position);
          const targetOffset = resolveTargetOffset(pointer, centerX, centerY);
          const shouldSense = sensorActive || targetOffset.distance <= PORT_CONFIG.TRIGGER_RADIUS;

          if (shouldSense) {
            targetRef.current = { x: targetOffset.x, y: targetOffset.y };
            nextPhase = targetOffset.distance <= PORT_CONFIG.LOCK_RADIUS ? 'locked' : 'sensing';
            nextValidTarget =
              nextPhase === 'locked' ? handleElement.classList.contains('valid') : null;
          } else {
            targetRef.current = { x: 0, y: 0 };
            nextPhase = 'releasing';
          }
        } else {
          targetRef.current = { x: 0, y: 0 };
          nextPhase = 'releasing';
        }
      } else if (isNodeVisible && !isConnecting && pointer) {
        const targetOffset = resolveTargetOffset(pointer, centerX, centerY);
        targetRef.current = { x: targetOffset.x, y: targetOffset.y };

        if (targetOffset.distance <= PORT_CONFIG.LOCK_RADIUS) {
          nextPhase = 'locked';
        } else if (targetOffset.distance <= PORT_CONFIG.TRIGGER_RADIUS) {
          nextPhase = 'sensing';
        } else {
          nextPhase = 'releasing';
        }
      } else {
        targetRef.current = { x: 0, y: 0 };
        nextPhase = phase === 'idle' ? 'idle' : 'releasing';
      }

      const current = currentRef.current;
      const velocity = velocityRef.current;
      const target = targetRef.current;

      velocity.x += (target.x - current.x) * PORT_CONFIG.SPRING;
      velocity.y += (target.y - current.y) * PORT_CONFIG.SPRING;
      velocity.x *= PORT_CONFIG.FRICTION;
      velocity.y *= PORT_CONFIG.FRICTION;
      current.x += velocity.x;
      current.y += velocity.y;

      const settled =
        Math.abs(current.x) < PORT_CONFIG.RELEASE_SETTLE_EPSILON
        && Math.abs(current.y) < PORT_CONFIG.RELEASE_SETTLE_EPSILON
        && Math.abs(velocity.x) < PORT_CONFIG.RELEASE_SETTLE_EPSILON
        && Math.abs(velocity.y) < PORT_CONFIG.RELEASE_SETTLE_EPSILON;

      if (
        ((!isConnecting || !isConnectionCandidate) && !isNodeVisible && settled)
        || (isNodeVisible && !isConnecting && nextPhase === 'releasing' && settled)
      ) {
        current.x = 0;
        current.y = 0;
        velocity.x = 0;
        velocity.y = 0;
        nextPhase = 'idle';
      }

      if (visualElement) {
        visualElement.style.left = `${centerX}px`;
        visualElement.style.top = `${centerY}px`;
        visualElement.style.transform = `translate3d(${current.x}px, ${current.y}px, 0)`;
      }

      if (inlineVisualStackElement) {
        if (shouldUseOverlay) {
          inlineVisualStackElement.style.setProperty('--magnetic-offset-x', '0px');
          inlineVisualStackElement.style.setProperty('--magnetic-offset-y', '0px');
        } else {
          inlineVisualStackElement.style.setProperty('--magnetic-offset-x', `${current.x}px`);
          inlineVisualStackElement.style.setProperty('--magnetic-offset-y', `${current.y}px`);
        }
      }

      setPhase((value) => (value === nextPhase ? value : nextPhase));
      setIsValidTarget((value) => (value === nextValidTarget ? value : nextValidTarget));

      if (!shouldAnimate && nextPhase === 'idle' && settled) {
        frameRef.current = null;
        return;
      }

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      if (visualStackRef.current) {
        visualStackRef.current.style.setProperty('--magnetic-offset-x', '0px');
        visualStackRef.current.style.setProperty('--magnetic-offset-y', '0px');
      }
    };
  }, [isConnecting, isConnectionCandidate, isNodeVisible, phase, pointerRef, position]);

  const validityState =
    phase === 'locked'
      ? isValidTarget === true
        ? 'valid'
        : 'invalid'
      : 'neutral';

  const visualState: VisualState =
    isActiveSourceHandle
      ? 'dragging'
      : isHandleHovering
        || (isConnecting && (phase === 'sensing' || phase === 'locked'))
        || (isNodeVisible && !isConnecting && (phase === 'sensing' || phase === 'locked'))
        ? 'hover'
        : 'idle';

  const isVisible =
    isActiveSourceHandle
    || (!isConnecting && isNodeVisible)
    || (isConnectionCandidate && isNodeVisible)
    || (isConnecting && (phase === 'sensing' || phase === 'locked' || phase === 'releasing'));

  const showOverlay =
    isConnecting
    && isConnectionCandidate
    && (phase === 'sensing' || phase === 'locked' || phase === 'releasing');

  return (
    <>
      <Handle
        ref={handleRef}
        position={position}
        className={`magnetic-handle ${className ?? ''}`.trim()}
        data-magnetic-position={position}
        data-magnetic-phase={phase}
        data-magnetic-validity={validityState}
        data-magnetic-connecting={isConnecting ? 'true' : 'false'}
        data-magnetic-visual-state={visualState}
        data-magnetic-active-source={isActiveSourceHandle ? 'true' : 'false'}
        data-magnetic-visible={isVisible ? 'true' : 'false'}
        data-magnetic-overlay-visible={showOverlay ? 'true' : 'false'}
        data-magnetic-handle-type={handleType}
        {...rest}
      >
        <div className="magnetic-handle__hit">
          <span ref={visualStackRef} className="magnetic-handle__visual-stack" aria-hidden="true">
            <span className="magnetic-handle__surface magnetic-handle__surface--idle" />
            <span className="magnetic-handle__surface magnetic-handle__surface--hover" />
            <span className="magnetic-handle__glyph magnetic-handle__glyph--plus">
              <span className="magnetic-handle__glyph-line" />
              <span className="magnetic-handle__glyph-line magnetic-handle__glyph-line--vertical" />
            </span>
          </span>
        </div>
        {children}
      </Handle>
      {showOverlay && typeof document !== 'undefined'
        ? createPortal(
          <div
            ref={visualRef}
            className="magnetic-handle__visual-layer"
            data-magnetic-position={position}
            data-magnetic-phase={phase}
            data-magnetic-validity={validityState}
            data-magnetic-visual-state={visualState}
            data-magnetic-active-source={isActiveSourceHandle ? 'true' : 'false'}
            data-magnetic-handle-type={handleType}
          >
            <span className="magnetic-handle__visual-stack" aria-hidden="true">
              <span className="magnetic-handle__surface magnetic-handle__surface--idle" />
              <span className="magnetic-handle__surface magnetic-handle__surface--hover" />
              <span className="magnetic-handle__glyph magnetic-handle__glyph--plus">
                <span className="magnetic-handle__glyph-line" />
                <span className="magnetic-handle__glyph-line magnetic-handle__glyph-line--vertical" />
              </span>
            </span>
          </div>,
          document.body
        )
        : null}
    </>
  );
});

MagneticHandle.displayName = 'MagneticHandle';
