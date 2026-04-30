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

function formatDuration(seconds: number): string {
  return `${seconds}s`;
}

function PendingThumbnail({ label }: { label: string }) {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[rgba(255,255,255,0.035)]">
      <div className="absolute inset-0 bg-[linear-gradient(110deg,transparent_0%,rgba(255,255,255,0.045)_42%,rgba(255,255,255,0.09)_50%,rgba(255,255,255,0.045)_58%,transparent_100%)] bg-[length:220%_100%] animate-[pulse_1.6s_ease-in-out_infinite]" />
      <div className="relative flex items-center gap-2 rounded-full border border-[rgba(255,255,255,0.12)] bg-black/24 px-3 py-1.5 text-[11px] font-medium text-text-muted">
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
        'group/card relative aspect-video overflow-hidden rounded-lg border bg-bg-dark text-left shadow-sm outline-none transition-all duration-150 focus-visible:border-accent/70',
        isSelected
          ? 'border-accent shadow-[0_0_0_1px_rgba(59,130,246,0.34)]'
          : 'border-[rgba(255,255,255,0.1)] hover:border-[rgba(255,255,255,0.24)]',
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

      <div className="absolute inset-0 bg-gradient-to-b from-black/42 via-transparent to-black/60" />

      {isSelected ? (
        <span className="absolute left-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white shadow-lg">
          <Check className="h-3 w-3" />
        </span>
      ) : null}

      <span className="absolute right-1 top-1 max-w-[calc(100%-2.25rem)] truncate rounded-md border border-white/10 bg-black/64 px-1.5 py-0.5 text-[10px] font-medium text-white shadow-sm backdrop-blur-sm">
        {modelName}
      </span>

      <span className="absolute bottom-1 left-1 rounded-md border border-white/10 bg-black/64 px-1.5 py-0.5 text-[10px] font-medium text-white shadow-sm backdrop-blur-sm">
        {formatDuration(variant.videoDurationSeconds)}
      </span>

      <div className="absolute bottom-1 right-1 flex gap-1 opacity-0 transition-opacity duration-150 group-hover/card:opacity-100">
        <button
          type="button"
          className="inline-flex h-6 items-center rounded-md border border-[rgba(255,255,255,0.16)] bg-black/72 px-2 text-[10px] font-medium text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-black/86"
          onClick={(event) => {
            event.stopPropagation();
            onPreview(index);
          }}
        >
          {labels.preview}
        </button>
        <button
          type="button"
          className="inline-flex h-6 items-center rounded-md border border-accent/40 bg-accent/86 px-2 text-[10px] font-medium text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-accent"
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

  if (isExpanded) {
    const labels = {
      preview: t('node.videoResult.preview'),
      adopt: t('node.videoResult.adopt'),
      thumbnailAlt: t('node.videoResult.thumbnailAlt'),
      missingThumbnail: t('node.videoResult.missingThumbnail'),
    };

    return (
      <div
        className={`relative overflow-y-auto ${VIDEO_RESULT_SURFACE_CLASS}`}
        style={{ height: `${contentHeight}px`, maxHeight: `${contentHeight}px` }}
        data-expanded={isExpanded}
      >
        <div className="grid grid-cols-2 gap-2 p-2">
          {variants.map((variant, index) => (
            <VariantCard
              key={variant.variantId}
              variant={variant}
              index={index}
              isSelected={index === selectedIndex}
              onSelect={onSelect}
              onPreview={onPreview}
              onAdopt={onAdopt}
              labels={labels}
            />
          ))}
        </div>
      </div>
    );
  }

  const selectedVariant = variants[selectedIndex] ?? variants[0];
  const deckVariants = [selectedVariant];
  const layerCount = Math.min(3, variants.length);
  for (let offset = 1; offset < layerCount; offset += 1) {
    deckVariants.push(variants[(selectedIndex + offset) % variants.length] ?? variants[offset]);
  }

  return (
    <div
      className={`relative overflow-visible ${VIDEO_RESULT_SURFACE_CLASS}`}
      style={{ height: `${contentHeight}px` }}
      data-expanded={isExpanded}
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
                'absolute inset-0 overflow-hidden rounded-[inherit] border bg-bg-dark shadow-lg transition-transform duration-150',
                isTopLayer ? 'z-30' : 'pointer-events-none',
              ].join(' ')}
              style={{
                zIndex: 30 - layerIndex,
                borderColor: layerIndex === 0 ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.1)',
                opacity: 1 - layerIndex * 0.12,
                transform: `translate(${layerIndex * 4}px, ${layerIndex * 3}px) rotate(${layerIndex * 1.2}deg)`,
              }}
            >
              {thumbnailUrl ? (
                <img
                  src={thumbnailUrl}
                  alt={t('node.videoResult.thumbnailAlt')}
                  className="h-full w-full object-cover"
                />
              ) : (
                <PendingThumbnail label={t('node.videoResult.missingThumbnail')} />
              )}

              {isTopLayer ? (
                <button
                  type="button"
                  className="absolute inset-0 flex items-center justify-center bg-black/14 opacity-0 transition-opacity duration-150 hover:opacity-100"
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

      <span className="pointer-events-none absolute right-2 top-2 z-40 inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-[rgba(255,255,255,0.16)] bg-black/64 px-2 text-[11px] font-semibold text-white shadow-lg">
        {variants.length}
      </span>
    </div>
  );
}
