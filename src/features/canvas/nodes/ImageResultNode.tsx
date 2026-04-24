import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Position, type NodeProps, useUpdateNodeInternals } from '@xyflow/react';
import {
  Check,
  ChevronDown,
  CornerUpLeft,
  Download,
  Image as ImageIcon,
  Info,
  Maximize2,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { resolveImageDisplayUrl } from '@/features/canvas/application/imageData';
import { nodeCatalog } from '@/features/canvas/application/nodeCatalog';
import { type ImageResultNodeData, isImageResultNode } from '@/features/canvas/domain/canvasNodes';
import { getConnectMenuNodeTypes } from '@/features/canvas/domain/nodeRegistry';
import { MagneticHandle } from '@/features/canvas/ui/MagneticHandle';
import {
  NODE_RESULT_HANDLE_CLASS,
  VIDEO_RESULT_BASE_WIDTH,
  VIDEO_RESULT_INFO_LABEL_CLASS,
  VIDEO_RESULT_INFO_VALUE_CLASS,
  VIDEO_RESULT_NODE_HOVER_CLASS,
  VIDEO_RESULT_NODE_RADIUS_CLASS,
  VIDEO_RESULT_NODE_SELECTED_CLASS,
  VIDEO_RESULT_NODE_SHELL_CLASS,
  VIDEO_RESULT_PANEL_CLASS,
  VIDEO_RESULT_SURFACE_CLASS,
  VIDEO_RESULT_TOP_BAR_CLASS,
  VIDEO_RESULT_TOP_BAR_HEIGHT,
} from '@/features/canvas/ui/nodeControlStyles';
import { CanvasNodeImage } from '@/features/canvas/ui/CanvasNodeImage';
import {
  NODE_HOVER_TOOLBAR_BUTTON_CLASS,
  NODE_HOVER_TOOLBAR_PANEL_CLASS,
  NODE_HOVER_TOOLBAR_TOP,
} from '@/features/canvas/ui/nodeToolbarConfig';
import { useCanvasStore } from '@/stores/canvasStore';

type ImageResultNodeProps = NodeProps & {
  id: string;
  data: ImageResultNodeData;
  selected?: boolean;
};

const IMAGE_RESULT_CONTENT_HEIGHT = 280;
const IMAGE_RESULT_DROPDOWN_COLUMNS = 2;

function downloadResolvedFile(url: string, fileName: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

export const ImageResultNode = memo(({ id, data, selected }: ImageResultNodeProps) => {
  const { t } = useTranslation();
  const updateNodeInternals = useUpdateNodeInternals();
  const nodes = useCanvasStore((state) => state.nodes);
  const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
  const addConnectedNode = useCanvasStore((state) => state.addConnectedNode);
  const selectVariant = useCanvasStore((state) => state.selectVariant);
  const deleteVariant = useCanvasStore((state) => state.deleteVariant);
  const openImageViewer = useCanvasStore((state) => state.openImageViewer);
  const activeVariant = data.variants[data.selectedVariantIndex] ?? data.variants[0] ?? null;
  const imageUrl = activeVariant?.imageUrl ? resolveImageDisplayUrl(activeVariant.imageUrl) : null;
  const isGenerating = (data as { isGenerating?: boolean }).isGenerating === true;
  const generationError = typeof (data as { generationError?: unknown }).generationError === 'string'
    ? ((data as { generationError?: string }).generationError ?? '').trim()
    : '';
  const sequenceNumber = useMemo(() => {
    const resultNodes = nodes.filter(
      (node) => isImageResultNode(node) && node.data.sourceGenNodeId === data.sourceGenNodeId
    );
    const currentIndex = resultNodes.findIndex((node) => node.id === id);
    return currentIndex >= 0 ? currentIndex + 1 : resultNodes.length + 1;
  }, [data.sourceGenNodeId, id, nodes]);
  const snapshotParams = data.snapshotParams as {
    model?: string;
    size?: string;
    aspectRatio?: string;
    prompt?: string;
  };
  const [isVariantMenuOpen, setIsVariantMenuOpen] = useState(false);
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const quickCreateRef = useRef<HTMLDivElement | null>(null);
  const quickCreateItems = useMemo(
    () => getConnectMenuNodeTypes('source').map((type) => nodeCatalog.getDefinition(type)),
    []
  );

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, updateNodeInternals]);

  useEffect(() => {
    if (!isQuickCreateOpen) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (quickCreateRef.current?.contains(event.target as Node)) {
        return;
      }
      setIsQuickCreateOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [isQuickCreateOpen]);

  const handleDownload = () => {
    if (!imageUrl) {
      return;
    }
    const suggestedName = `image-${sequenceNumber}-${(activeVariant?.variantId ?? 'variant').slice(0, 8)}.png`;
    downloadResolvedFile(imageUrl, suggestedName);
  };

  const openPreview = () => {
    if (!imageUrl) {
      return;
    }
    openImageViewer(
      imageUrl,
      data.variants.map((variant) => resolveImageDisplayUrl(variant.imageUrl))
    );
  };

  return (
    <div
      className={[
        'group relative flex h-full flex-col overflow-visible border transition-[width,height,border-color,box-shadow] duration-200 ease-out',
        VIDEO_RESULT_NODE_RADIUS_CLASS,
        VIDEO_RESULT_NODE_SHELL_CLASS,
        selected ? VIDEO_RESULT_NODE_SELECTED_CLASS : VIDEO_RESULT_NODE_HOVER_CLASS,
      ].join(' ')}
      style={{ width: `${VIDEO_RESULT_BASE_WIDTH}px`, height: `${VIDEO_RESULT_TOP_BAR_HEIGHT + IMAGE_RESULT_CONTENT_HEIGHT}px` }}
      onClick={() => setSelectedNode(id)}
    >
      <div
        className={`relative flex items-center justify-between ${VIDEO_RESULT_TOP_BAR_CLASS}`}
        style={{ height: `${VIDEO_RESULT_TOP_BAR_HEIGHT}px` }}
      >
        <div className="flex min-w-0 items-center gap-1.5 text-[11px]">
          <ImageIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate font-medium">{t('node.imageResult.label')}</span>
          <span className="text-text-muted">#{sequenceNumber}</span>
        </div>

        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-text-dark transition-colors hover:bg-white/8"
          onClick={(event) => {
            event.stopPropagation();
            setIsVariantMenuOpen((previous) => !previous);
          }}
        >
          <span>{data.selectedVariantIndex + 1}</span>
          <ChevronDown className="h-3.5 w-3.5" />
        </button>

        <div ref={quickCreateRef} className="absolute right-12 top-0 z-40">
          <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[rgba(255,255,255,0.14)] bg-bg-dark/68 text-text-dark opacity-0 transition-all duration-150 group-hover:opacity-100 hover:border-[rgba(255,255,255,0.28)] hover:bg-bg-dark"
            onClick={(event) => {
              event.stopPropagation();
              setIsQuickCreateOpen((previous) => !previous);
            }}
            title={t('node.result.quickCreate')}
          >
            +
          </button>

          {isQuickCreateOpen ? (
            <div className={`absolute right-0 top-[calc(100%+8px)] min-w-[220px] overflow-hidden ${VIDEO_RESULT_PANEL_CLASS}`}>
              {quickCreateItems.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-bg-dark/72"
                  onClick={(event) => {
                    event.stopPropagation();
                    void addConnectedNode({
                      sourceNodeId: id,
                      targetType: item.type,
                    });
                    setIsQuickCreateOpen(false);
                  }}
                >
                  <span className="text-text-dark">{t(item.menuLabelKey)}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {isVariantMenuOpen ? (
          <div
            className={`absolute right-1 top-[calc(100%+8px)] z-40 w-[248px] p-2 ${VIDEO_RESULT_PANEL_CLASS}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${IMAGE_RESULT_DROPDOWN_COLUMNS}, minmax(0, 1fr))` }}
            >
              {data.variants.map((variant, variantIndex) => {
                const itemImageUrl = resolveImageDisplayUrl(variant.imageUrl);
                const isActive = variantIndex === data.selectedVariantIndex;
                return (
                  <div
                    key={variant.variantId}
                    className="overflow-hidden rounded-lg border border-[rgba(255,255,255,0.08)] bg-bg-dark/72"
                  >
                    <button
                      type="button"
                      className="relative block w-full"
                      onClick={() => {
                        void selectVariant({ resultNodeId: id, variantIndex });
                        setIsVariantMenuOpen(false);
                      }}
                    >
                      <img
                        src={itemImageUrl}
                        alt={`${t('node.imageResult.label')} ${variantIndex + 1}`}
                        className="h-20 w-full object-cover"
                      />
                      {isActive ? (
                        <span className="absolute left-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white">
                          <Check className="h-3 w-3" />
                        </span>
                      ) : null}
                    </button>
                    <div className="flex items-center justify-between px-2 py-1.5 text-[10px] text-text-muted">
                      <span>#{variantIndex + 1}</span>
                      <button
                        type="button"
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-red-500/16 hover:text-red-200"
                        onClick={() => {
                          void deleteVariant({ resultNodeId: id, variantIndex });
                          if (variantIndex === data.selectedVariantIndex) {
                            setIsVariantMenuOpen(false);
                          }
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      <div
        className={`relative flex-1 overflow-hidden ${VIDEO_RESULT_SURFACE_CLASS}`}
        style={{ height: `${IMAGE_RESULT_CONTENT_HEIGHT}px` }}
      >
        {imageUrl ? (
          <CanvasNodeImage
            src={imageUrl}
            alt={t('node.imageResult.imageAlt')}
            viewerSourceUrl={imageUrl}
            viewerImageList={data.variants.map((variant) => resolveImageDisplayUrl(variant.imageUrl))}
            className="h-full w-full object-contain"
          />
        ) : generationError ? (
          <div className="flex h-full w-full items-center justify-center px-5 text-center text-xs text-red-200">
            {generationError}
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-text-muted">
            {isGenerating ? t('node.imageResult.generating') : t('node.imageResult.empty')}
          </div>
        )}

        {imageUrl ? (
          <button
            type="button"
            className="absolute inset-0 bg-black/0 transition-colors duration-150 group-hover:bg-black/6"
            onClick={(event) => {
              event.stopPropagation();
              openPreview();
            }}
          />
        ) : null}
      </div>

      <div
        className="pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
        style={{ top: `${NODE_HOVER_TOOLBAR_TOP}px` }}
      >
        <div className={NODE_HOVER_TOOLBAR_PANEL_CLASS} onClick={(event) => event.stopPropagation()}>
          <button type="button" className={NODE_HOVER_TOOLBAR_BUTTON_CLASS} onClick={() => handleDownload()}>
            <Download className="h-3.5 w-3.5" />
            <span>{t('node.imageResult.download')}</span>
          </button>
          <button type="button" className={NODE_HOVER_TOOLBAR_BUTTON_CLASS} onClick={() => openPreview()}>
            <Maximize2 className="h-3.5 w-3.5" />
            <span>{t('node.imageResult.preview')}</span>
          </button>
          <button
            type="button"
            className={NODE_HOVER_TOOLBAR_BUTTON_CLASS}
            onClick={() => setSelectedNode(data.sourceGenNodeId)}
          >
            <CornerUpLeft className="h-3.5 w-3.5" />
            <span>{t('node.imageResult.trace')}</span>
          </button>
          <div className="group/info relative pointer-events-auto">
            <button type="button" className={NODE_HOVER_TOOLBAR_BUTTON_CLASS}>
              <Info className="h-3.5 w-3.5" />
              <span>{t('node.imageResult.info')}</span>
            </button>
            <div className={`absolute right-0 top-[calc(100%+8px)] hidden w-[240px] p-3 group-hover/info:block ${VIDEO_RESULT_PANEL_CLASS}`}>
              <div className="space-y-2">
                <div>
                  <div className={VIDEO_RESULT_INFO_LABEL_CLASS}>{t('node.imageResult.model')}</div>
                  <div className={VIDEO_RESULT_INFO_VALUE_CLASS}>{snapshotParams.model ?? '-'}</div>
                </div>
                <div>
                  <div className={VIDEO_RESULT_INFO_LABEL_CLASS}>{t('node.imageResult.size')}</div>
                  <div className={VIDEO_RESULT_INFO_VALUE_CLASS}>{snapshotParams.size ?? '-'}</div>
                </div>
                <div>
                  <div className={VIDEO_RESULT_INFO_LABEL_CLASS}>{t('node.imageResult.aspectRatio')}</div>
                  <div className={VIDEO_RESULT_INFO_VALUE_CLASS}>{snapshotParams.aspectRatio ?? '-'}</div>
                </div>
                <div>
                  <div className={VIDEO_RESULT_INFO_LABEL_CLASS}>{t('node.imageResult.prompt')}</div>
                  <div className={`${VIDEO_RESULT_INFO_VALUE_CLASS} line-clamp-4 whitespace-pre-wrap break-words`}>
                    {snapshotParams.prompt ?? '-'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <MagneticHandle type="target" id="target" position={Position.Left} className={NODE_RESULT_HANDLE_CLASS} />
      <MagneticHandle type="source" id="source" position={Position.Right} className={NODE_RESULT_HANDLE_CLASS} />
    </div>
  );
});

ImageResultNode.displayName = 'ImageResultNode';
