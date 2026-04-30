import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import {
  ChevronDown,
  Clapperboard,
  Play,
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
import { VideoResultStack } from '@/features/canvas/nodes/VideoResultStack';
import { VideoResultToolbar } from '@/features/canvas/nodes/VideoResultToolbar';
import { MagneticHandle } from '@/features/canvas/ui/MagneticHandle';
import {
  NODE_RESULT_HANDLE_CLASS,
  VIDEO_RESULT_BASE_WIDTH,
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
import { useCanvasStore } from '@/stores/canvasStore';

type VideoResultNodeProps = NodeProps & {
  id: string;
  data: VideoResultNodeData;
  selected?: boolean;
};

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
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
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
  const displaySnapshotParams = activeVariant?.snapshotParams ?? data.snapshotParams;
  const ratio = useMemo(() => parseAspectRatio(aspectRatio), [aspectRatio]);
  const contentHeight = Math.round((VIDEO_RESULT_BASE_WIDTH * ratio.height) / ratio.width);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [isStackExpanded, setIsStackExpanded] = useState(false);
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const expandedGridHeight = useMemo(() => {
    const rows = Math.ceil(data.variants.length / 2);
    return rows * 96 + (rows - 1) * 8 + 16;
  }, [data.variants.length]);
  const dynamicContentHeight =
    data.variants.length > 1 && isStackExpanded ? Math.min(expandedGridHeight, 360) : contentHeight;
  const nodeHeight = VIDEO_RESULT_TOP_BAR_HEIGHT + dynamicContentHeight;
  const hasMultipleVariants = data.variants.length > 1;
  const thumbnailUrl = useMemo(
    () => (activeVariant?.thumbnailRef ? resolveImageDisplayUrl(activeVariant.thumbnailRef) : null),
    [activeVariant?.thumbnailRef]
  );
  const videoUrl = useMemo(
    () => (activeVariant?.videoRef ? resolveImageDisplayUrl(activeVariant.videoRef) : null),
    [activeVariant?.videoRef]
  );
  const playerVideoRef = useRef<HTMLVideoElement | null>(null);
  const quickCreateRef = useRef<HTMLDivElement | null>(null);
  const quickCreateItems = useMemo(
    () => getConnectMenuNodeTypes('source').map((type) => nodeCatalog.getDefinition(type)),
    []
  );

  useEffect(() => {
    updateNodeInternals(id);
  }, [dynamicContentHeight, id, updateNodeInternals]);

  useEffect(() => {
    if (data.variants.length < 2 && isStackExpanded) {
      setIsStackExpanded(false);
    }
  }, [data.variants.length, isStackExpanded]);

  useEffect(() => {
    if (isStackExpanded && isQuickCreateOpen) {
      setIsQuickCreateOpen(false);
    }
  }, [isQuickCreateOpen, isStackExpanded]);

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

  const handleAdopt = useCallback(
    (variantIndex: number) => {
      const kept = data.variants[variantIndex];
      if (!kept) {
        return;
      }
      updateNodeData(id, {
        variants: [kept],
        selectedVariantIndex: 0,
        stack: [kept],
        activeIndex: 0,
        pendingCandidates: null,
        candidateSelection: [],
      });
      setIsStackExpanded(false);
    },
    [data.variants, id, updateNodeData]
  );

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
            if (hasMultipleVariants) {
              setIsStackExpanded((previous) => !previous);
            }
          }}
          title={hasMultipleVariants ? t('node.videoResult.stackCount', { count: data.variants.length }) : undefined}
        >
          <span>{isStackExpanded && hasMultipleVariants ? t('node.videoResult.collapse') : data.variants.length}</span>
          <ChevronDown
            className={['h-3.5 w-3.5 transition-transform', isStackExpanded ? 'rotate-180' : ''].join(' ')}
          />
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

      </div>

      {hasMultipleVariants ? (
        <VideoResultStack
          variants={data.variants}
          selectedIndex={data.selectedVariantIndex}
          contentHeight={dynamicContentHeight}
          isExpanded={isStackExpanded}
          onToggleExpand={() => setIsStackExpanded((previous) => !previous)}
          onSelect={(variantIndex) => void selectVariant({ resultNodeId: id, variantIndex })}
          onPreview={(variantIndex) => {
            void selectVariant({ resultNodeId: id, variantIndex });
            setIsPlayerOpen(true);
          }}
          onAdopt={handleAdopt}
        />
      ) : (
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
      )}

      <VideoResultToolbar
        snapshotParams={displaySnapshotParams}
        durationSeconds={activeVariant?.videoDurationSeconds ?? data.snapshotParams.duration}
        aspectRatio={aspectRatio}
        onDownload={handleDownload}
        onFullscreen={handleFullscreen}
        onTrace={() => setSelectedNode(data.sourceGenNodeId)}
      />

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
