import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Position, type NodeProps } from '@xyflow/react';
import { Camera, Maximize2, X, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CANVAS_NODE_TYPES, type SceneComposerNodeData } from '@/features/canvas/domain/canvasNodes';
import { resolveNodeDisplayName } from '@/features/canvas/domain/nodeDisplay';
import { MagneticHandle } from '@/features/canvas/ui/MagneticHandle';
import { NodeHeader, NODE_HEADER_FLOATING_POSITION_CLASS } from '@/features/canvas/ui/NodeHeader';
import { useCanvasStore } from '@/stores/canvasStore';

const NODE_WIDTH = 320;
const NODE_HEIGHT = 220;
const TRANSITION_MS = 260;

type SceneComposerNodeProps = NodeProps & {
  id: string;
  data: SceneComposerNodeData;
  selected?: boolean;
};

export const SceneComposerNode = memo(({ id, data, selected }: SceneComposerNodeProps) => {
  const { t } = useTranslation();
  const setSelectedNode = useCanvasStore((s) => s.setSelectedNode);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const inputImageUrl = useCanvasStore((s) => {
    const node = s.nodes.find((n) => n.id === id);
    if (!node || node.type !== CANVAS_NODE_TYPES.sceneComposer) return null;
    return (node.data as SceneComposerNodeData).inputImageUrl ?? null;
  });

  // mounted = portal in DOM, visible = CSS transition target state
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const open = useCallback(() => {
    setMounted(true);
    // next frame: trigger CSS transition
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
  }, []);

  const close = useCallback(() => {
    setVisible(false);
    setIframeLoaded(false);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setMounted(false), TRANSITION_MS);
  }, []);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const resolvedTitle = useMemo(
    () => resolveNodeDisplayName(CANVAS_NODE_TYPES.sceneComposer, data),
    [data],
  );

  // Listen for export messages from the iframe
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type !== 'sceneforge:export') return;
      if (iframeRef.current && event.source !== iframeRef.current.contentWindow) return;

      const { imageDataUrl, sceneJson, prompt } = event.data;
      updateNodeData(id, {
        compositionImageUrl: imageDataUrl ?? null,
        sceneJson: typeof sceneJson === 'string' ? sceneJson : JSON.stringify(sceneJson, null, 2),
        compositionPrompt: prompt ?? null,
      });
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [id, updateNodeData]);

  const hasExport = Boolean(data.compositionImageUrl);
  const hasInput = Boolean(inputImageUrl);

  // Push upstream image into iframe as reference input.
  useEffect(() => {
    if (!mounted || !visible || !iframeLoaded) return;
    if (!iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      { type: 'sceneforge:setInputImage', imageDataUrl: inputImageUrl ?? null },
      '*',
    );
  }, [mounted, visible, iframeLoaded, inputImageUrl]);

  const sceneInfo = useMemo(() => {
    if (!data.sceneJson) return null;
    try {
      const parsed = typeof data.sceneJson === 'string' ? JSON.parse(data.sceneJson) : data.sceneJson;
      return {
        cameraDesc: parsed.camera?.description ?? '',
        objectCount: parsed.objects?.length ?? 0,
        aspectRatio: parsed.aspect_ratio ?? '',
      };
    } catch { return null; }
  }, [data.sceneJson]);

  return (
    <>
      {/* Small card */}
      <div
        className={`
          group relative flex flex-col overflow-visible rounded-[var(--node-radius)] border bg-surface-dark transition-colors duration-150
          ${selected
            ? 'border-accent shadow-[0_0_0_1px_rgba(59,130,246,0.32)]'
            : 'border-[rgba(15,23,42,0.22)] hover:border-[rgba(15,23,42,0.34)] dark:border-[rgba(255,255,255,0.22)] dark:hover:border-[rgba(255,255,255,0.34)]'}
        `}
        style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
        onClick={() => {
          // First click selects; second click opens the editor.
          if (selected) open();
          else setSelectedNode(id);
        }}
      >
        <NodeHeader
          className={NODE_HEADER_FLOATING_POSITION_CLASS}
          icon={<Camera className="h-4 w-4" />}
          titleText={resolvedTitle}
          editable
          onTitleChange={(next) => updateNodeData(id, { displayName: next })}
        />

        <MagneticHandle
          type="target"
          id="target"
          position={Position.Left}
          className="!h-2 !w-2 !bg-accent !border-accent"
        />
        <MagneticHandle
          type="source"
          id="source"
          position={Position.Right}
          className="!h-2 !w-2 !bg-accent !border-accent"
        />

        <button
          className="nodrag absolute top-2 right-2 z-10 flex h-7 w-7 items-center justify-center rounded-md bg-bg-dark/80 text-text-muted hover:bg-accent/20 hover:text-accent transition-colors"
          onClick={(e) => { e.stopPropagation(); open(); }}
          title={t('node.sceneComposer.openEditor')}
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>

        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 pt-8">
          {hasExport ? (
            <>
              <img
                src={data.compositionImageUrl!}
                alt={t('node.sceneComposer.previewAlt')}
                className="max-h-[110px] w-auto rounded-md border border-[rgba(255,255,255,0.08)] object-contain"
              />
              <div className="flex items-center gap-1.5 text-[10px] text-green-400">
                <Check className="h-3 w-3" />
                {t('node.sceneComposer.syncedToNode')}
              </div>
            </>
          ) : (
            <>
              <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-bg-dark/60 text-text-muted/40">
                <Camera className="h-8 w-8" />
              </div>
              <p className="text-[11px] text-text-muted/60">
                {hasInput
                  ? t('node.sceneComposer.inputReadyHint')
                  : t('node.sceneComposer.connectInputHint')}
              </p>
            </>
          )}

          {sceneInfo && (
            <div className="flex flex-wrap justify-center gap-2 text-[10px] text-text-muted/70">
              {sceneInfo.cameraDesc && <span className="rounded bg-bg-dark/60 px-1.5 py-0.5">{sceneInfo.cameraDesc}</span>}
              {sceneInfo.objectCount > 0 && (
                <span className="rounded bg-bg-dark/60 px-1.5 py-0.5">
                  {sceneInfo.objectCount} objects
                </span>
              )}
              {sceneInfo.aspectRatio && <span className="rounded bg-bg-dark/60 px-1.5 py-0.5">{sceneInfo.aspectRatio}</span>}
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen editor (Portal) */}
      {mounted && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          style={{ pointerEvents: 'auto' }}
        >
          {/* Backdrop opacity transition */}
          <div
            className="absolute inset-0 bg-black/85 backdrop-blur-sm"
            style={{
              opacity: visible ? 1 : 0,
              transition: `opacity ${TRANSITION_MS}ms cubic-bezier(0.2, 0.9, 0.3, 1)`,
            }}
            onClick={close}
          />

          {/* Editor scale + opacity transition */}
          <div
            className="relative z-10 flex flex-col overflow-hidden rounded-2xl border border-[rgba(255,255,255,0.1)] shadow-2xl"
            style={{
              width: 'calc(100vw - 80px)',
              height: 'calc(100vh - 80px)',
              opacity: visible ? 1 : 0,
              transform: visible ? 'scale(1)' : 'scale(0.88)',
              borderRadius: visible ? '16px' : '24px',
              transition: `opacity ${TRANSITION_MS}ms cubic-bezier(0.2, 0.9, 0.3, 1), transform ${TRANSITION_MS}ms cubic-bezier(0.2, 0.9, 0.3, 1), border-radius ${TRANSITION_MS}ms cubic-bezier(0.2, 0.9, 0.3, 1)`,
              willChange: 'transform, opacity',
            }}
          >
            {/* Header bar */}
            <div className="flex items-center justify-between bg-[#0d0d0d] px-4 py-2 border-b border-[rgba(255,255,255,0.08)]">
              <div className="flex items-center gap-2 text-sm text-[#f5f5f7]">
                <Camera className="h-4 w-4 text-[#0a84ff]" />
                <span className="font-medium">{resolvedTitle}</span>
                <span className="text-[11px] text-[rgba(255,255,255,0.4)]">SceneForge</span>
              </div>
              <button
                className="flex h-7 w-7 items-center justify-center rounded-md text-[rgba(255,255,255,0.5)] hover:bg-[rgba(255,255,255,0.08)] hover:text-white transition-colors"
                onClick={close}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <iframe
              ref={iframeRef}
              src="/scene_composer_v11.html"
              className="w-full flex-1 border-0 bg-black"
              sandbox="allow-scripts allow-same-origin"
              title="SceneForge"
              onLoad={() => setIframeLoaded(true)}
            />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
});

SceneComposerNode.displayName = 'SceneComposerNode';
