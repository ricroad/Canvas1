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
      <img src={imageUrl} alt={t('node.imageResult.imageAlt')} className="h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/34 via-transparent to-black/58" />

      {isSelected ? (
        <span className="absolute left-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white shadow-lg">
          <Check className="h-3 w-3" />
        </span>
      ) : null}

      <span className="absolute right-1 top-1 rounded-md border border-white/10 bg-black/64 px-1.5 py-0.5 text-[10px] font-medium text-white shadow-sm backdrop-blur-sm">
        #{index + 1}
      </span>

      <div className="absolute bottom-1 right-1 flex gap-1 opacity-0 transition-opacity duration-150 group-hover/card:opacity-100">
        <button
          type="button"
          className="inline-flex h-6 items-center gap-1 rounded-md border border-[rgba(255,255,255,0.16)] bg-black/72 px-2 text-[10px] font-medium text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-black/86"
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
          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-red-300/24 bg-black/72 text-red-100 shadow-sm backdrop-blur-sm transition-colors hover:bg-red-500/26"
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

  if (isExpanded) {
    return (
      <div
        className={`relative overflow-y-auto ${VIDEO_RESULT_SURFACE_CLASS}`}
        style={{ height: `${contentHeight}px`, maxHeight: `${contentHeight}px` }}
      >
        <div className="grid grid-cols-2 gap-2 p-2">
          {variants.map((variant, index) => (
            <ImageVariantCard
              key={variant.variantId}
              variant={variant}
              index={index}
              isSelected={index === selectedIndex}
              onSelect={onSelect}
              onPreview={onPreview}
              onDelete={onDelete}
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

      <span className="pointer-events-none absolute right-2 top-2 z-40 inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-[rgba(255,255,255,0.16)] bg-black/64 px-2 text-[11px] font-semibold text-white shadow-lg">
        {variants.length}
      </span>
    </div>
  );
}
