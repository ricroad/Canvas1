import { Check, Loader2, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { resolveImageDisplayUrl } from '@/features/canvas/application/imageData';
import type { VideoVariant } from '@/features/canvas/domain/canvasNodes';
import { getVideoModel } from '@/features/canvas/models';
import {
  VIDEO_RESULT_OVERLAY_BUTTON_CLASS,
  VIDEO_RESULT_SURFACE_CLASS,
} from '@/features/canvas/ui/nodeControlStyles';

export interface VideoResultStackProps {
  variants: VideoVariant[];
  selectedIndex: number;
  contentHeight: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onSelect: (index: number) => void;
  onPreview: (index: number) => void;
  onAdopt: (index: number) => void;
}

interface VariantCardProps {
  variant: VideoVariant;
  index: number;
  isSelected: boolean;
  onSelect: (index: number) => void;
  onPreview: (index: number) => void;
  onAdopt: (index: number) => void;
  labels: {
    preview: string;
    adopt: string;
    thumbnailAlt: string;
    missingThumbnail: string;
  };
}

const VARIANT_CARD_BASE_CLASS =
  'group/card relative aspect-video overflow-hidden rounded-[10px] border bg-bg-dark/95 text-left shadow-[0_2px_14px_rgba(0,0,0,0.22)] outline-none transition-all duration-150 focus-visible:border-accent/60';
const VARIANT_CARD_SELECTED_CLASS =
  'border-accent/70 shadow-[0_0_0_1px_rgba(59,130,246,0.24),0_4px_18px_rgba(0,0,0,0.26)]';
const VARIANT_CARD_IDLE_CLASS =
  'border-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.16)]';
const VARIANT_BADGE_CLASS =
  'rounded-md border border-[rgba(255,255,255,0.08)] bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur-sm';
const VARIANT_ACTION_CLASS =
  'inline-flex h-6 items-center rounded-md border border-[rgba(255,255,255,0.12)] bg-black/55 px-2 text-[10px] font-medium text-white/90 backdrop-blur-sm transition-colors hover:bg-black/70';
const VARIANT_PRIMARY_ACTION_CLASS =
  'inline-flex h-6 items-center rounded-md border border-accent/30 bg-accent/70 px-2 text-[10px] font-medium text-white backdrop-blur-sm transition-colors hover:bg-accent/90';
const STACK_LAYER_SHADOW = '0 2px 14px rgba(0,0,0,0.24)';
const STACK_CONTAINER_MOTION_CLASS = 'transition-[height,max-height] duration-200 ease-out';
const STACK_VIEW_MOTION_CLASS = 'transition-[opacity,transform] duration-200 ease-out';

function formatDuration(seconds: number): string {
  return `${seconds}s`;
}

function PendingThumbnail({ label }: { label: string }) {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-white/[0.025]">
      <div className="absolute inset-0 bg-[linear-gradient(110deg,transparent_0%,rgba(255,255,255,0.035)_42%,rgba(255,255,255,0.07)_50%,rgba(255,255,255,0.035)_58%,transparent_100%)] bg-[length:220%_100%] animate-[pulse_1.6s_ease-in-out_infinite]" />
      <div className="relative flex items-center gap-2 rounded-full border border-[rgba(255,255,255,0.08)] bg-black/20 px-3 py-1.5 text-[11px] font-medium text-text-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-accent/80" />
        <span>{label}</span>
      </div>
    </div>
  );
}

function VariantCard({
  variant,
  index,
  isSelected,
  onSelect,
  onPreview,
  onAdopt,
  labels,
}: VariantCardProps) {
  const thumbnailUrl = resolveImageDisplayUrl(variant.thumbnailRef);
  const modelName = getVideoModel(variant.snapshotParams.modelId).displayName;

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
      {thumbnailUrl ? (
        <img src={thumbnailUrl} alt={labels.thumbnailAlt} className="h-full w-full object-cover" />
      ) : (
        <PendingThumbnail label={labels.missingThumbnail} />
      )}

      <div className="absolute inset-0 bg-gradient-to-b from-black/24 via-transparent to-black/42" />

      {isSelected ? (
        <span className="absolute left-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent/90 text-white shadow-[0_2px_8px_rgba(0,0,0,0.22)]">
          <Check className="h-3 w-3" />
        </span>
      ) : null}

      <span className={`absolute right-1 top-1 max-w-[calc(100%-2.25rem)] truncate ${VARIANT_BADGE_CLASS}`}>
        {modelName}
      </span>

      <span className={`absolute bottom-1 left-1 ${VARIANT_BADGE_CLASS}`}>
        {formatDuration(variant.videoDurationSeconds)}
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
          {labels.preview}
        </button>
        <button
          type="button"
          className={VARIANT_PRIMARY_ACTION_CLASS}
          onClick={(event) => {
            event.stopPropagation();
            onAdopt(index);
          }}
        >
          {labels.adopt}
        </button>
      </div>
    </div>
  );
}

export function VideoResultStack({
  variants,
  selectedIndex,
  contentHeight,
  isExpanded,
  onToggleExpand,
  onSelect,
  onPreview,
  onAdopt,
}: VideoResultStackProps) {
  const { t } = useTranslation();

  if (variants.length === 0) {
    return null;
  }

  if (variants.length < 2) {
    return (
      <div
        className={`relative overflow-hidden ${VIDEO_RESULT_SURFACE_CLASS}`}
        style={{ height: `${contentHeight}px` }}
        data-expanded={isExpanded}
      />
    );
  }

  const labels = {
    preview: t('node.videoResult.preview'),
    adopt: t('node.videoResult.adopt'),
    thumbnailAlt: t('node.videoResult.thumbnailAlt'),
    missingThumbnail: t('node.videoResult.missingThumbnail'),
  };

  const selectedVariant = variants[selectedIndex] ?? variants[0];
  const deckVariants = [selectedVariant];
  const layerCount = Math.min(3, variants.length);
  for (let offset = 1; offset < layerCount; offset += 1) {
    deckVariants.push(variants[(selectedIndex + offset) % variants.length] ?? variants[offset]);
  }

  return (
    <div
      className={[
        'relative',
        isExpanded ? 'overflow-y-auto' : 'overflow-visible',
        STACK_CONTAINER_MOTION_CLASS,
        VIDEO_RESULT_SURFACE_CLASS,
      ].join(' ')}
      style={{ height: `${contentHeight}px`, maxHeight: `${contentHeight}px` }}
      data-expanded={isExpanded}
    >
      <div
        className={[
          'absolute inset-0',
          STACK_VIEW_MOTION_CLASS,
          isExpanded ? 'pointer-events-none scale-[0.985] opacity-0' : 'scale-100 opacity-100',
        ].join(' ')}
      >
        {deckVariants
          .map((variant, layerIndex) => ({ variant, layerIndex }))
          .reverse()
          .map(({ variant, layerIndex }) => {
            const thumbnailUrl = resolveImageDisplayUrl(variant.thumbnailRef);
            const isTopLayer = layerIndex === 0;
            return (
              <div
                key={`${variant.variantId}-${layerIndex}`}
                className={[
                  'absolute inset-0 overflow-hidden rounded-[inherit] border bg-bg-dark transition-[opacity,transform] duration-200 ease-out',
                  isTopLayer ? 'z-30' : 'pointer-events-none',
                ].join(' ')}
                style={{
                  zIndex: 30 - layerIndex,
                  borderColor: layerIndex === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.08)',
                  boxShadow: STACK_LAYER_SHADOW,
                  opacity: (1 - layerIndex * 0.08) * (isExpanded ? 0 : 1),
                  transform: isExpanded
                    ? `translate(${layerIndex * 2}px, ${layerIndex * 1.5}px) rotate(0deg) scale(0.98)`
                    : `translate(${layerIndex * 4}px, ${layerIndex * 3}px) rotate(${layerIndex * 1.2}deg) scale(1)`,
                }}
              >
                {thumbnailUrl ? (
                  <img src={thumbnailUrl} alt={labels.thumbnailAlt} className="h-full w-full object-cover" />
                ) : (
                  <PendingThumbnail label={labels.missingThumbnail} />
                )}

                {isTopLayer ? (
                  <button
                    type="button"
                    className="absolute inset-0 flex items-center justify-center bg-black/10 opacity-0 transition-opacity duration-150 hover:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleExpand();
                    }}
                  >
                    <span className={`${VIDEO_RESULT_OVERLAY_BUTTON_CLASS} h-14 w-14`}>
                      <Play className="ml-1 h-6 w-6" />
                    </span>
                  </button>
                ) : null}
              </div>
            );
          })}
      </div>

      <div
        className={[
          'relative grid grid-cols-2 gap-2 p-2',
          STACK_VIEW_MOTION_CLASS,
          isExpanded ? 'translate-y-0 scale-100 opacity-100' : 'pointer-events-none translate-y-2 scale-[0.985] opacity-0',
        ].join(' ')}
      >
        {variants.map((variant, index) => (
          <div
            key={variant.variantId}
            className="transition-[opacity,transform] duration-200 ease-out"
            style={{
              transitionDelay: isExpanded ? `${Math.min(index, 5) * 24}ms` : '0ms',
              opacity: isExpanded ? 1 : 0,
              transform: isExpanded ? 'translateY(0) scale(1)' : 'translateY(6px) scale(0.98)',
            }}
          >
            <VariantCard
              variant={variant}
              index={index}
              isSelected={index === selectedIndex}
              onSelect={onSelect}
              onPreview={onPreview}
              onAdopt={onAdopt}
              labels={labels}
            />
          </div>
        ))}
      </div>

      <span className="pointer-events-none absolute right-2 top-2 z-40 inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-[rgba(255,255,255,0.12)] bg-black/55 px-2 text-[11px] font-semibold text-white/95 shadow-[0_2px_10px_rgba(0,0,0,0.22)] backdrop-blur-sm">
        {variants.length}
      </span>
    </div>
  );
}
