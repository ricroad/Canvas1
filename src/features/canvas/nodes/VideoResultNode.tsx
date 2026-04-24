import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import {
  Check,
  ChevronDown,
  Clapperboard,
  CornerUpLeft,
  Download,
  Info,
  Maximize2,
  Play,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { saveFileDialog } from '@/commands/web/dialog';
import { resolveImageDisplayUrl } from '@/features/canvas/application/imageData';
import { nodeCatalog } from '@/features/canvas/application/nodeCatalog';
import {
  type VideoResultNodeData,
  type VideoVariant,
  isVideoGenNode,
} from '@/features/canvas/domain/canvasNodes';
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
  VIDEO_RESULT_OVERLAY_BUTTON_CLASS,
  VIDEO_RESULT_PANEL_CLASS,
  VIDEO_RESULT_SURFACE_CLASS,
  VIDEO_RESULT_TOP_BAR_CLASS,
  VIDEO_RESULT_TOP_BAR_HEIGHT,
} from '@/features/canvas/ui/nodeControlStyles';
import {
  NODE_HOVER_TOOLBAR_BUTTON_CLASS,
  NODE_HOVER_TOOLBAR_PANEL_CLASS,
  NODE_HOVER_TOOLBAR_TOP,
} from '@/features/canvas/ui/nodeToolbarConfig';
import { useCanvasStore } from '@/stores/canvasStore';

type VideoResultNodeProps = NodeProps & {
  id: string;
  data: VideoResultNodeData;
  selected?: boolean;
};

const VIDEO_RESULT_DROPDOWN_COLUMNS = 2;

function parseAspectRatio(aspectRatio: string | null | undefined): { width: number; height: number } {
  if (!aspectRatio) {
    return { width: 1, height: 1 };
  }
  const [rawWidth = '1', rawHeight = '1'] = aspectRatio.split(':');
  const width = Number(rawWidth);
  const height = Number(rawHeight);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: 1, height: 1 };
  }
  return { width, height };
}

function resolveSelectedVariant(data: VideoResultNodeData): VideoVariant | null {
  return data.variants[data.selectedVariantIndex] ?? data.variants[0] ?? null;
}

function downloadResolvedFile(url: string, fileName: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

export const VideoResultNode = memo(({ id, data, selected }: VideoResultNodeProps) => {
  const { t } = useTranslation();
  const updateNodeInternals = useUpdateNodeInternals();
  const nodes = useCanvasStore((state) => state.nodes);
  const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
  const addConnectedNode = useCanvasStore((state) => state.addConnectedNode);
  const selectVariant = useCanvasStore((state) => state.selectVariant);
  const deleteVariant = useCanvasStore((state) => state.deleteVariant);
  const activeVariant = useMemo(() => resolveSelectedVariant(data), [data]);
  const sourceGenNode = useMemo(
    () => nodes.find((node) => node.id === data.sourceGenNodeId) ?? null,
    [data.sourceGenNodeId, nodes]
  );
  const sequenceNumber = useMemo(() => {
    if (!sourceGenNode || !isVideoGenNode(sourceGenNode)) {
      return 1;
    }
    return Math.max(1, sourceGenNode.data.generatedResultNodeIds.indexOf(id) + 1);
  }, [id, sourceGenNode]);
  const aspectRatio = activeVariant?.snapshotParams.aspectRatio ?? data.snapshotParams.aspectRatio;
  const ratio = useMemo(() => parseAspectRatio(aspectRatio), [aspectRatio]);
  const contentHeight = Math.round((VIDEO_RESULT_BASE_WIDTH * ratio.height) / ratio.width);
  const nodeHeight = VIDEO_RESULT_TOP_BAR_HEIGHT + contentHeight;
  const thumbnailUrl = useMemo(
    () => (activeVariant?.thumbnailRef ? resolveImageDisplayUrl(activeVariant.thumbnailRef) : null),
    [activeVariant?.thumbnailRef]
  );
  const videoUrl = useMemo(
    () => (activeVariant?.videoRef ? resolveImageDisplayUrl(activeVariant.videoRef) : null),
    [activeVariant?.videoRef]
  );
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [isVariantMenuOpen, setIsVariantMenuOpen] = useState(false);
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const playerVideoRef = useRef<HTMLVideoElement | null>(null);
  const quickCreateRef = useRef<HTMLDivElement | null>(null);
  const quickCreateItems = useMemo(
    () => getConnectMenuNodeTypes('source').map((type) => nodeCatalog.getDefinition(type)),
    []
  );

  useEffect(() => {
    updateNodeInternals(id);
  }, [contentHeight, id, updateNodeInternals]);

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

  const handleDownload = async () => {
    if (!videoUrl) {
      return;
    }
    const suggestedName = `video-${sequenceNumber}-${(activeVariant?.variantId ?? 'variant').slice(0, 8)}.mp4`;
    const selectedPath = await saveFileDialog({
      defaultPath: suggestedName,
      filters: [{ name: 'Video', extensions: ['mp4'] }],
    });
    if (!selectedPath) {
      return;
    }

    if (selectedPath === suggestedName) {
      downloadResolvedFile(videoUrl, suggestedName);
      return;
    }

    downloadResolvedFile(videoUrl, selectedPath.split(/[\\/]/).pop() ?? suggestedName);
  };

  const handleFullscreen = async () => {
    setIsPlayerOpen(true);
    requestAnimationFrame(async () => {
      try {
        await playerVideoRef.current?.requestFullscreen?.();
      } catch {
        // Ignore fullscreen failures and keep the modal open.
      }
    });
  };

  return (
    <div
      className={[
        'group relative flex h-full flex-col overflow-visible border transition-[width,height,border-color,box-shadow] duration-200 ease-out',
        VIDEO_RESULT_NODE_RADIUS_CLASS,
        VIDEO_RESULT_NODE_SHELL_CLASS,
        selected ? VIDEO_RESULT_NODE_SELECTED_CLASS : VIDEO_RESULT_NODE_HOVER_CLASS,
      ].join(' ')}
      style={{ width: `${VIDEO_RESULT_BASE_WIDTH}px`, height: `${nodeHeight}px` }}
      onClick={() => setSelectedNode(id)}
    >
      <div
        className={`relative flex items-center justify-between ${VIDEO_RESULT_TOP_BAR_CLASS}`}
        style={{ height: `${VIDEO_RESULT_TOP_BAR_HEIGHT}px` }}
      >
        <div className="flex min-w-0 items-center gap-1.5 text-[11px]">
          <Clapperboard className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate font-medium">{t('node.videoResult.label')}</span>
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
              style={{ gridTemplateColumns: `repeat(${VIDEO_RESULT_DROPDOWN_COLUMNS}, minmax(0, 1fr))` }}
            >
              {data.variants.map((variant, variantIndex) => {
                const itemThumbnailUrl = resolveImageDisplayUrl(variant.thumbnailRef);
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
                        src={itemThumbnailUrl}
                        alt={`${t('node.videoResult.label')} ${variantIndex + 1}`}
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
        style={{ height: `${contentHeight}px` }}
      >
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt={t('node.videoResult.thumbnailAlt')} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-text-muted">
            {t('node.videoResult.missingThumbnail')}
          </div>
        )}

        <button
          type="button"
          className="absolute inset-0 flex items-center justify-center bg-black/14 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
          onClick={(event) => {
            event.stopPropagation();
            setIsPlayerOpen(true);
          }}
        >
          <span className={`${VIDEO_RESULT_OVERLAY_BUTTON_CLASS} h-14 w-14`}>
            <Play className="ml-1 h-6 w-6" />
          </span>
        </button>
      </div>

      <div
        className="pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
        style={{ top: `${NODE_HOVER_TOOLBAR_TOP}px` }}
      >
        <div className={NODE_HOVER_TOOLBAR_PANEL_CLASS} onClick={(event) => event.stopPropagation()}>
          <button type="button" className={NODE_HOVER_TOOLBAR_BUTTON_CLASS} onClick={() => void handleDownload()}>
            <Download className="h-3.5 w-3.5" />
            <span>{t('node.videoResult.download')}</span>
          </button>
          <button type="button" className={NODE_HOVER_TOOLBAR_BUTTON_CLASS} onClick={() => void handleFullscreen()}>
            <Maximize2 className="h-3.5 w-3.5" />
            <span>{t('node.videoResult.fullscreen')}</span>
          </button>
          <button
            type="button"
            className={NODE_HOVER_TOOLBAR_BUTTON_CLASS}
            onClick={() => setSelectedNode(data.sourceGenNodeId)}
          >
            <CornerUpLeft className="h-3.5 w-3.5" />
            <span>{t('node.videoResult.trace')}</span>
          </button>
          <div className="group/info relative pointer-events-auto">
            <button type="button" className={NODE_HOVER_TOOLBAR_BUTTON_CLASS}>
              <Info className="h-3.5 w-3.5" />
              <span>{t('node.videoResult.info')}</span>
            </button>
            <div className={`absolute right-0 top-[calc(100%+8px)] hidden w-[240px] p-3 group-hover/info:block ${VIDEO_RESULT_PANEL_CLASS}`}>
              <div className="space-y-2">
                <div>
                  <div className={VIDEO_RESULT_INFO_LABEL_CLASS}>{t('node.videoResult.model')}</div>
                  <div className={VIDEO_RESULT_INFO_VALUE_CLASS}>{data.snapshotParams.modelId}</div>
                </div>
                <div>
                  <div className={VIDEO_RESULT_INFO_LABEL_CLASS}>{t('node.videoResult.duration')}</div>
                  <div className={VIDEO_RESULT_INFO_VALUE_CLASS}>{activeVariant?.videoDurationSeconds ?? data.snapshotParams.duration}s</div>
                </div>
                <div>
                  <div className={VIDEO_RESULT_INFO_LABEL_CLASS}>{t('node.videoResult.aspectRatio')}</div>
                  <div className={VIDEO_RESULT_INFO_VALUE_CLASS}>{aspectRatio}</div>
                </div>
                <div>
                  <div className={VIDEO_RESULT_INFO_LABEL_CLASS}>{t('node.videoResult.mode')}</div>
                  <div className={VIDEO_RESULT_INFO_VALUE_CLASS}>
                    {typeof data.snapshotParams.extraParams?.mode === 'string'
                      ? data.snapshotParams.extraParams.mode
                      : '-'}
                  </div>
                </div>
                <div>
                  <div className={VIDEO_RESULT_INFO_LABEL_CLASS}>{t('node.videoResult.prompt')}</div>
                  <div className={`${VIDEO_RESULT_INFO_VALUE_CLASS} line-clamp-4 whitespace-pre-wrap break-words`}>
                    {data.snapshotParams.prompt || '-'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <MagneticHandle type="target" id="gen-input" position={Position.Left} className={NODE_RESULT_HANDLE_CLASS} />
      <MagneticHandle type="source" id="video-output" position={Position.Right} className={NODE_RESULT_HANDLE_CLASS} />

      {typeof document !== 'undefined' && isPlayerOpen && videoUrl
        ? createPortal(
          <div className="fixed inset-0 z-[180] flex items-center justify-center" onClick={() => setIsPlayerOpen(false)}>
            <div className="absolute inset-0 bg-black/78" />
            <div
              className={`relative z-10 w-[min(92vw,1080px)] overflow-hidden p-3 ${VIDEO_RESULT_PANEL_CLASS}`}
              onClick={(event) => event.stopPropagation()}
            >
              <video
                ref={playerVideoRef}
                src={videoUrl}
                controls
                autoPlay
                className="max-h-[84vh] w-full rounded-lg bg-black"
              />
            </div>
          </div>,
          document.body
        )
        : null}
    </div>
  );
});

VideoResultNode.displayName = 'VideoResultNode';
