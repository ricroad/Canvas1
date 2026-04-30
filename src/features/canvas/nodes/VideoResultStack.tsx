import { Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { resolveImageDisplayUrl } from '@/features/canvas/application/imageData';
import type { VideoVariant } from '@/features/canvas/domain/canvasNodes';
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

export function VideoResultStack({
  variants,
  selectedIndex,
  contentHeight,
  isExpanded,
  onToggleExpand,
}: VideoResultStackProps) {
  const { t } = useTranslation();

  if (variants.length === 0) {
    return null;
  }

  if (variants.length < 2 || isExpanded) {
    return (
      <div
        className={`relative overflow-hidden ${VIDEO_RESULT_SURFACE_CLASS}`}
        style={{ height: `${contentHeight}px` }}
        data-expanded={isExpanded}
      />
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
                'absolute inset-0 overflow-hidden rounded-[inherit] border border-[rgba(255,255,255,0.12)] bg-bg-dark shadow-lg transition-transform duration-150',
                isTopLayer ? 'z-30' : 'pointer-events-none',
              ].join(' ')}
              style={{
                zIndex: 30 - layerIndex,
                opacity: 1 - layerIndex * 0.18,
                transform: `translate(${layerIndex * 6}px, ${layerIndex * 4}px) rotate(${layerIndex * 2}deg)`,
              }}
            >
              {thumbnailUrl ? (
                <img
                  src={thumbnailUrl}
                  alt={t('node.videoResult.thumbnailAlt')}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-text-muted">
                  {t('node.videoResult.missingThumbnail')}
                </div>
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
