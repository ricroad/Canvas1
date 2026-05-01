import { type CSSProperties, type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';
import { Check, Maximize2, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { resolveImageDisplayUrl } from '@/features/canvas/application/imageData';
import type { ImageVariant } from '@/features/canvas/domain/canvasNodes';
import { VIDEO_RESULT_SURFACE_CLASS } from '@/features/canvas/ui/nodeControlStyles';

interface ImageResultStackProps {
  variants: ImageVariant[];
  selectedIndex: number;
  contentHeight: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onSelect: (index: number) => void;
  onPreview: (index: number) => void;
  onDelete: (index: number) => void;
}

interface ImageVariantCardProps {
  variant: ImageVariant;
  index: number;
  isSelected: boolean;
  onSelect: (index: number) => void;
  onPreview: (index: number) => void;
  onDelete: (index: number) => void;
}

const VARIANT_CARD_BASE_CLASS =
  'group/card relative h-full w-full overflow-hidden rounded-[10px] border bg-bg-dark/95 text-left shadow-[0_2px_14px_rgba(0,0,0,0.22)] outline-none transition-all duration-150 focus-visible:border-accent/60';
const VARIANT_CARD_SELECTED_CLASS =
  'border-accent/70 shadow-[0_0_0_1px_rgba(59,130,246,0.24),0_4px_18px_rgba(0,0,0,0.26)]';
const VARIANT_CARD_IDLE_CLASS =
  'border-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.16)]';
const VARIANT_BADGE_CLASS =
  'rounded-md border border-[rgba(255,255,255,0.08)] bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur-sm';
const VARIANT_ACTION_CLASS =
  'inline-flex h-6 items-center gap-1 rounded-md border border-[rgba(255,255,255,0.12)] bg-black/55 px-2 text-[10px] font-medium text-white/90 backdrop-blur-sm transition-colors hover:bg-black/70';
const VARIANT_DELETE_ACTION_CLASS =
  'inline-flex h-6 w-6 items-center justify-center rounded-md border border-[rgba(255,255,255,0.1)] bg-black/50 text-red-100/90 backdrop-blur-sm transition-colors hover:border-red-300/20 hover:bg-red-500/20';
const STACK_LAYER_SHADOW = '0 2px 14px rgba(0,0,0,0.24)';
const STACK_VIEW_MOTION_CLASS = 'transition-[opacity,transform] duration-200 ease-out';
const STACK_MOTION_MS = 280;
const EXPANDED_GAP = 12;
const DRAG_PREVIEW_THRESHOLD = 6;
const ZERO_OFFSET = { x: 0, y: 0 };
const COLLAPSED_LAYER_TRANSFORMS = [
  { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 },
  { x: -10, y: 10, rotate: -4.2, scale: 0.985, opacity: 0.82 },
  { x: 13, y: 16, rotate: 3.4, scale: 0.97, opacity: 0.68 },
  { x: 1, y: 24, rotate: -1.8, scale: 0.955, opacity: 0.54 },
];

function getExpandedSlot(depth: number): { x: number; y: number } {
  const slots = [
    { x: 0, y: 0 },
    { x: 0, y: -1 },
    { x: 1, y: -1 },
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: 2, y: -1 },
  ];

  if (depth < slots.length) {
    return slots[depth];
  }

  const overflowDepth = depth - slots.length;
  return {
    x: 3 + (overflowDepth % 2),
    y: -Math.floor(overflowDepth / 2),
  };
}

function getCollapsedDepth(index: number, selectedIndex: number, total: number): number {
  if (index === selectedIndex) {
    return 0;
  }

  return (index - selectedIndex + total) % total;
}

function getMotionCardStyle(
  index: number,
  selectedIndex: number,
  total: number,
  isExpandedTarget: boolean,
  offset = ZERO_OFFSET
): CSSProperties {
  const depth = getCollapsedDepth(index, selectedIndex, total);

  if (isExpandedTarget) {
    const slot = getExpandedSlot(depth);
    return {
      width: '100%',
      height: '100%',
      opacity: 1,
      transform: `translate(calc(${slot.x} * (100% + ${EXPANDED_GAP}px)), calc(${slot.y} * (100% + ${EXPANDED_GAP}px))) translate(${offset.x}px, ${offset.y}px) rotate(0deg) scale(1)`,
      zIndex: 80 - depth,
      transition: `opacity ${STACK_MOTION_MS}ms ease-out, transform ${STACK_MOTION_MS}ms cubic-bezier(0.2, 0, 0, 1), width ${STACK_MOTION_MS}ms cubic-bezier(0.2, 0, 0, 1), height ${STACK_MOTION_MS}ms cubic-bezier(0.2, 0, 0, 1)`,
      transitionDelay: `${Math.min(depth, 5) * 16}ms`,
    };
  }

  const visibleDepth = Math.min(depth, COLLAPSED_LAYER_TRANSFORMS.length - 1);
  const collapsed = COLLAPSED_LAYER_TRANSFORMS[visibleDepth] ?? COLLAPSED_LAYER_TRANSFORMS[0];
  return {
    width: '100%',
    height: '100%',
    opacity: depth >= COLLAPSED_LAYER_TRANSFORMS.length ? 0 : collapsed.opacity,
    transform: `translate(${collapsed.x + offset.x}px, ${collapsed.y + offset.y}px) rotate(${collapsed.rotate}deg) scale(${collapsed.scale})`,
    zIndex: 50 - visibleDepth,
    transition: `opacity ${STACK_MOTION_MS}ms ease-out, transform ${STACK_MOTION_MS}ms cubic-bezier(0.2, 0, 0, 1), width ${STACK_MOTION_MS}ms cubic-bezier(0.2, 0, 0, 1), height ${STACK_MOTION_MS}ms cubic-bezier(0.2, 0, 0, 1)`,
    transitionDelay: `${Math.min(depth, 5) * 10}ms`,
  };
}

function useStackMotion(isExpanded: boolean) {
  const previousExpandedRef = useRef(isExpanded);
  const [isMotionVisible, setIsMotionVisible] = useState(false);
  const [motionExpanded, setMotionExpanded] = useState(isExpanded);

  useEffect(() => {
    if (previousExpandedRef.current === isExpanded) {
      setMotionExpanded(isExpanded);
      return;
    }

    const previousExpanded = previousExpandedRef.current;
    previousExpandedRef.current = isExpanded;
    setMotionExpanded(previousExpanded);
    setIsMotionVisible(true);

    const frame = window.requestAnimationFrame(() => {
      setMotionExpanded(isExpanded);
    });
    const timeout = window.setTimeout(() => {
      setIsMotionVisible(false);
    }, STACK_MOTION_MS + 120);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [isExpanded]);

  return { isMotionVisible, motionExpanded };
}

function useStackDragPreview(isExpanded: boolean, isStackMotionVisible: boolean, onToggleExpand: () => void) {
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const releaseTimeoutRef = useRef<number | null>(null);
  const [isDragPreviewVisible, setIsDragPreviewVisible] = useState(false);
  const [isDragPreviewExpanded, setIsDragPreviewExpanded] = useState(false);
  const [dragOffset, setDragOffset] = useState(ZERO_OFFSET);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
      if (releaseTimeoutRef.current !== null) {
        window.clearTimeout(releaseTimeoutRef.current);
      }
    };
  }, []);

  const releasePointerCapture = (event: ReactPointerEvent<HTMLElement>) => {
    if (pointerIdRef.current === null) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(pointerIdRef.current)) {
      event.currentTarget.releasePointerCapture(pointerIdRef.current);
    }
    pointerIdRef.current = null;
  };

  const closeDragPreview = () => {
    setIsDragPreviewExpanded(false);
    setDragOffset(ZERO_OFFSET);
    if (releaseTimeoutRef.current !== null) {
      window.clearTimeout(releaseTimeoutRef.current);
    }
    releaseTimeoutRef.current = window.setTimeout(() => {
      setIsDragPreviewVisible(false);
    }, STACK_MOTION_MS + 80);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (isExpanded || isStackMotionVisible || event.button !== 0) {
      return;
    }

    event.stopPropagation();
    startRef.current = { x: event.clientX, y: event.clientY };
    pointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const start = startRef.current;
    if (!start || isExpanded || isStackMotionVisible) {
      return;
    }

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const distance = Math.hypot(dx, dy);
    if (!isDragPreviewVisible && distance < DRAG_PREVIEW_THRESHOLD) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setDragOffset({ x: dx * 0.18, y: dy * 0.18 });

    if (!isDragPreviewVisible) {
      setIsDragPreviewVisible(true);
      setIsDragPreviewExpanded(false);
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
      frameRef.current = window.requestAnimationFrame(() => {
        setIsDragPreviewExpanded(true);
      });
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const start = startRef.current;
    if (!start) {
      return;
    }

    const wasPreviewing = isDragPreviewVisible;
    startRef.current = null;
    releasePointerCapture(event);
    event.stopPropagation();

    if (wasPreviewing) {
      event.preventDefault();
      closeDragPreview();
      return;
    }

    onToggleExpand();
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLElement>) => {
    if (!startRef.current) {
      return;
    }

    startRef.current = null;
    releasePointerCapture(event);
    closeDragPreview();
  };

  return {
    dragOffset,
    handlePointerCancel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    isDragPreviewExpanded,
    isDragPreviewVisible,
  };
}

function ImageVariantCard({
  variant,
  index,
  isSelected,
  onSelect,
  onPreview,
  onDelete,
}: ImageVariantCardProps) {
  const { t } = useTranslation();
  const imageUrl = resolveImageDisplayUrl(variant.imageUrl);

  return (
    <div
      role="button"
      tabIndex={0}
      className={[
        VARIANT_CARD_BASE_CLASS,
        isSelected ? VARIANT_CARD_SELECTED_CLASS : VARIANT_CARD_IDLE_CLASS,
      ].join(' ')}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(index);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          onSelect(index);
        }
      }}
    >
      <img src={imageUrl} alt={t('node.imageResult.imageAlt')} className="h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/18 via-transparent to-black/40" />

      {isSelected ? (
        <span className="absolute left-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent/90 text-white shadow-[0_2px_8px_rgba(0,0,0,0.22)]">
          <Check className="h-3 w-3" />
        </span>
      ) : null}

      <span className={`absolute right-1 top-1 ${VARIANT_BADGE_CLASS}`}>
        #{index + 1}
      </span>

      <div className="absolute bottom-1 right-1 flex gap-1 opacity-0 transition-opacity duration-150 group-hover/card:opacity-100">
        <button
          type="button"
          className={VARIANT_ACTION_CLASS}
          onClick={(event) => {
            event.stopPropagation();
            onPreview(index);
          }}
        >
          <Maximize2 className="h-3 w-3" />
          <span>{t('node.imageResult.preview')}</span>
        </button>
        <button
          type="button"
          className={VARIANT_DELETE_ACTION_CLASS}
          onClick={(event) => {
            event.stopPropagation();
            onDelete(index);
          }}
          title={t('common.delete')}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

export function ImageResultStack({
  variants,
  selectedIndex,
  contentHeight,
  isExpanded,
  onToggleExpand,
  onSelect,
  onPreview,
  onDelete,
}: ImageResultStackProps) {
  const { t } = useTranslation();
  const { isMotionVisible, motionExpanded } = useStackMotion(isExpanded);
  const dragPreview = useStackDragPreview(isExpanded, isMotionVisible, onToggleExpand);

  if (variants.length === 0) {
    return null;
  }

  if (variants.length < 2) {
    return (
      <div
        className={`relative overflow-hidden ${VIDEO_RESULT_SURFACE_CLASS}`}
        style={{ height: `${contentHeight}px` }}
      />
    );
  }

  const selectedVariant = variants[selectedIndex] ?? variants[0];
  const deckVariants = [selectedVariant];
  const layerCount = Math.min(COLLAPSED_LAYER_TRANSFORMS.length, variants.length);
  for (let offset = 1; offset < layerCount; offset += 1) {
    deckVariants.push(variants[(selectedIndex + offset) % variants.length] ?? variants[offset]);
  }

  return (
    <div
      className={[
        'relative',
        'overflow-visible',
        VIDEO_RESULT_SURFACE_CLASS,
      ].join(' ')}
      style={{ height: `${contentHeight}px` }}
    >
      <div
        role={isExpanded ? undefined : 'button'}
        tabIndex={isExpanded ? -1 : 0}
        aria-label={isExpanded ? undefined : t('node.imageResult.expandStack')}
        className={[
          'absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-accent/50 rounded-[inherit]',
          STACK_VIEW_MOTION_CLASS,
          isExpanded || isMotionVisible
            ? 'pointer-events-none scale-[0.985] opacity-0'
            : dragPreview.isDragPreviewVisible
              ? 'cursor-grabbing scale-[0.995] opacity-40'
              : 'cursor-grab scale-100 opacity-100',
        ].join(' ')}
        onPointerCancel={dragPreview.handlePointerCancel}
        onPointerDown={dragPreview.handlePointerDown}
        onPointerMove={dragPreview.handlePointerMove}
        onPointerUp={dragPreview.handlePointerUp}
        onKeyDown={(event) => {
          if (isExpanded) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            onToggleExpand();
          }
        }}
      >
        {deckVariants
          .map((variant, layerIndex) => ({ variant, layerIndex }))
          .reverse()
          .map(({ variant, layerIndex }) => {
            const imageUrl = resolveImageDisplayUrl(variant.imageUrl);
            const isTopLayer = layerIndex === 0;
            const collapsedLayer = COLLAPSED_LAYER_TRANSFORMS[layerIndex] ?? COLLAPSED_LAYER_TRANSFORMS[0];

            return (
              <div
                key={`${variant.variantId}-${layerIndex}`}
                className="absolute inset-0 overflow-hidden rounded-[inherit] border bg-bg-dark transition-[opacity,transform] duration-200 ease-out"
                style={{
                  zIndex: 30 - layerIndex,
                  borderColor: isTopLayer ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.07)',
                  boxShadow: STACK_LAYER_SHADOW,
                  opacity: collapsedLayer.opacity * (isExpanded ? 0 : 1),
                  transform: isExpanded
                    ? `translate(0px, 0px) rotate(0deg) scale(0.98)`
                    : `translate(${collapsedLayer.x}px, ${collapsedLayer.y}px) rotate(${collapsedLayer.rotate}deg) scale(${collapsedLayer.scale})`,
                }}
              >
                <img src={imageUrl} alt={t('node.imageResult.imageAlt')} className="h-full w-full object-cover" />
              </div>
            );
          })}
      </div>

      {isMotionVisible || dragPreview.isDragPreviewVisible ? (
        <div className="pointer-events-none absolute inset-0 z-50 overflow-visible">
          {variants.map((variant, index) => {
            const imageUrl = resolveImageDisplayUrl(variant.imageUrl);
            const isDragPreview = dragPreview.isDragPreviewVisible;
            return (
              <div
                key={`motion-${variant.variantId}`}
                className="absolute left-0 top-0 overflow-hidden rounded-[10px] border bg-bg-dark"
                style={{
                  ...getMotionCardStyle(
                    index,
                    selectedIndex,
                    variants.length,
                    isDragPreview ? dragPreview.isDragPreviewExpanded : motionExpanded,
                    isDragPreview ? dragPreview.dragOffset : ZERO_OFFSET
                  ),
                  borderColor: index === selectedIndex ? 'rgba(59,130,246,0.42)' : 'rgba(255,255,255,0.08)',
                  boxShadow: isDragPreview ? '0 10px 32px rgba(0,0,0,0.32)' : STACK_LAYER_SHADOW,
                }}
              >
                <img src={imageUrl} alt={t('node.imageResult.imageAlt')} className="h-full w-full object-cover" />
                <div
                  className={[
                    'absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/28',
                    isDragPreview ? 'ring-1 ring-white/10' : '',
                  ].join(' ')}
                />
              </div>
            );
          })}
        </div>
      ) : null}

      {isExpanded && !isMotionVisible && !dragPreview.isDragPreviewVisible ? (
        <div className="absolute inset-0 z-50 overflow-visible">
          {variants.map((variant, index) => (
            <div
              key={variant.variantId}
              className="absolute left-0 top-0"
              style={getMotionCardStyle(index, selectedIndex, variants.length, true)}
            >
              <ImageVariantCard
                variant={variant}
                index={index}
                isSelected={index === selectedIndex}
                onSelect={onSelect}
                onPreview={onPreview}
                onDelete={onDelete}
              />
            </div>
          ))}
        </div>
      ) : null}

      <span
        className={[
          'pointer-events-none absolute right-2 top-2 z-40 inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-[rgba(255,255,255,0.12)] bg-black/55 px-2 text-[11px] font-semibold text-white/95 shadow-[0_2px_10px_rgba(0,0,0,0.22)] backdrop-blur-sm transition-opacity duration-200',
          isExpanded ? 'opacity-0' : 'opacity-100',
        ].join(' ')}
      >
        {variants.length}
      </span>
    </div>
  );
}
