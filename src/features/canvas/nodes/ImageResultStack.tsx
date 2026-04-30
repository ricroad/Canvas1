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
  'group/card relative aspect-video overflow-hidden rounded-[10px] border bg-bg-dark/95 text-left shadow-[0_2px_14px_rgba(0,0,0,0.22)] outline-none transition-all duration-150 focus-visible:border-accent/60';
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
const STACK_CONTAINER_MOTION_CLASS = 'transition-[height,max-height] duration-200 ease-out';
const STACK_VIEW_MOTION_CLASS = 'transition-[opacity,transform] duration-200 ease-out';

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
            const imageUrl = resolveImageDisplayUrl(variant.imageUrl);
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
                <img src={imageUrl} alt={t('node.imageResult.imageAlt')} className="h-full w-full object-cover" />

                {isTopLayer ? (
                  <button
                    type="button"
                    className="absolute inset-0 bg-black/0 transition-colors duration-150 hover:bg-black/8"
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleExpand();
                    }}
                  />
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

      <span className="pointer-events-none absolute right-2 top-2 z-40 inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-[rgba(255,255,255,0.12)] bg-black/55 px-2 text-[11px] font-semibold text-white/95 shadow-[0_2px_10px_rgba(0,0,0,0.22)] backdrop-blur-sm">
        {variants.length}
      </span>
    </div>
  );
}
