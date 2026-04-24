import { useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { invoke } from '@tauri-apps/api/core';
import { isTauriEnv } from './commands/platform';
import { Canvas } from './features/canvas/Canvas';
import { TitleBar } from './components/TitleBar';
import { LeftStrip } from './components/LeftStrip';
import { CopilotPanel } from './features/copilot/CopilotPanel';
import { SettingsDialog } from './components/SettingsDialog';
import { GlobalErrorDialog } from './components/GlobalErrorDialog';
import { ProjectManager } from './features/project/ProjectManager';
import { useThemeStore } from './stores/themeStore';
import { useProjectStore } from './stores/projectStore';
import { useCanvasStore } from './stores/canvasStore';
import { useSettingsStore } from './stores/settingsStore';
import {
  getNodePrimaryImageUrl,
  isVideoGenNode,
  type VideoVariant,
  type CanvasEdge,
  type CanvasNode,
} from './features/canvas/domain/canvasNodes';
import {
  subscribeOpenGlobalErrorDialog,
  type GlobalErrorDialogDetail,
} from './features/app/errorDialogEvents';
import {
  subscribeOpenSettingsDialog,
  type SettingsCategory,
} from './features/settings/settingsEvents';

function toRgbCssValue(hexColor: string): string {
  const hex = hexColor.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    return '59 130 246';
  }
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

function App() {
  const { theme } = useThemeStore();
  const uiRadiusPreset = useSettingsStore((state) => state.uiRadiusPreset);
  const themeTonePreset = useSettingsStore((state) => state.themeTonePreset);
  const accentColor = useSettingsStore((state) => state.accentColor);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsInitialCategory, setSettingsInitialCategory] = useState<SettingsCategory>('general');
  const [globalError, setGlobalError] = useState<GlobalErrorDialogDetail | null>(null);

  const isHydrated = useProjectStore((state) => state.isHydrated);
  const hydrate = useProjectStore((state) => state.hydrate);
  const currentProjectId = useProjectStore((state) => state.currentProjectId);
  const closeProject = useProjectStore((state) => state.closeProject);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.uiRadius = uiRadiusPreset;
  }, [uiRadiusPreset]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.themeTone = themeTonePreset;
  }, [themeTonePreset]);

  useEffect(() => {
    const root = document.documentElement;
    const isMac =
      typeof navigator !== 'undefined'
      && /(Mac|iPhone|iPad|iPod)/i.test(`${navigator.platform} ${navigator.userAgent}`);
    root.dataset.platform = isMac ? 'macos' : 'default';
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const normalized = accentColor.startsWith('#') ? accentColor : `#${accentColor}`;
    root.style.setProperty('--accent', normalized);
    root.style.setProperty('--accent-rgb', toRgbCssValue(normalized));
  }, [accentColor]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    const unsubscribe = subscribeOpenGlobalErrorDialog((detail) => {
      setGlobalError(detail);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeOpenSettingsDialog(({ category }) => {
      setSettingsInitialCategory(category ?? 'general');
      setShowSettings(true);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof window.setTimeout> | null = null;

    const notifyFrontendReady = async (attempt = 1) => {
      if (cancelled) {
        return;
      }

      try {
        if (!isTauriEnv()) return;
        await invoke('frontend_ready');
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (attempt === 1 || attempt % 10 === 0) {
          console.warn('failed to notify frontend readiness', error);
        }

        const retryDelayMs = Math.min(500, 80 * attempt);
        retryTimer = window.setTimeout(() => {
          void notifyFrontendReady(attempt + 1);
        }, retryDelayMs);
      }
    };

    requestAnimationFrame(() => {
      void notifyFrontendReady();
    });

    return () => {
      cancelled = true;
      if (retryTimer) {
        window.clearTimeout(retryTimer);
      }
    };
  }, []);

  useEffect(() => {
    if (!isTauriEnv()) {
      return;
    }

    let unlisten: (() => void) | null = null;
    const successfulVariantsByBatch = new Map<string, Map<string, VideoVariant>>();

    void (async () => {
      const { listen } = await import('@tauri-apps/api/event');
      unlisten = await listen<{
        batchId: string;
        subTaskId: string;
        variantId?: string;
        taskId: string;
        nodeId: string;
        status: 'submitted' | 'processing' | 'succeed' | 'failed';
        progress: number;
        videoRef?: string;
        thumbnailRef?: string;
        videoDurationSeconds?: number;
        klingVideoId?: string;
        error?: string;
        errorCode?: number;
      }>('video-task-progress', (event) => {
        const payload = event.payload;
        const canvasStore = useCanvasStore.getState();
        const targetNode = canvasStore.nodes.find((node) => node.id === payload.nodeId);
        if (!targetNode || !isVideoGenNode(targetNode)) {
          return;
        }

        const currentBatch = targetNode.data.currentBatch;
        if (!currentBatch || currentBatch.batchId !== payload.batchId) {
          return;
        }

        const nextSubTasks = currentBatch.subTasks.map((subTask) =>
          subTask.subTaskId !== payload.subTaskId
            ? subTask
            : {
              ...subTask,
              klingTaskId: payload.taskId || subTask.klingTaskId,
              status: payload.status,
              progress: payload.progress,
              errorMessage: payload.error,
              errorCode: payload.errorCode,
            }
        );

        if (payload.status === 'submitted' || payload.status === 'processing' || payload.status === 'failed') {
          canvasStore.updateNodeData(payload.nodeId, {
            currentBatch: {
              ...currentBatch,
              subTasks: nextSubTasks,
            },
            currentTask: {
              taskId: payload.taskId,
              status: payload.status === 'failed' ? 'failed' : payload.status,
              progress: payload.progress,
              errorMessage: payload.error,
              errorCode: payload.errorCode,
              submittedAt: targetNode.data.currentTask?.submittedAt ?? Date.now(),
            },
          });
        }

        if (payload.status === 'succeed' && payload.videoRef && payload.thumbnailRef) {
          const batchVariants = successfulVariantsByBatch.get(payload.batchId) ?? new Map<string, VideoVariant>();
          const snapshotParams = {
            modelId: targetNode.data.modelId,
            prompt: targetNode.data.prompt,
            negativePrompt: targetNode.data.negativePrompt,
            duration: targetNode.data.duration,
            aspectRatio: targetNode.data.aspectRatio,
            extraParams: { ...(targetNode.data.extraParams ?? {}) },
            firstFrameRef: '',
          };
          batchVariants.set(payload.subTaskId, {
            variantId: payload.variantId ?? payload.subTaskId,
            klingTaskId: payload.taskId,
            klingVideoId: payload.klingVideoId,
            videoRef: payload.videoRef,
            thumbnailRef: payload.thumbnailRef,
            videoDurationSeconds: payload.videoDurationSeconds ?? targetNode.data.duration,
            generatedAt: Date.now(),
            snapshotParams,
          });
          successfulVariantsByBatch.set(payload.batchId, batchVariants);
          canvasStore.updateNodeData(payload.nodeId, {
            currentBatch: {
              ...currentBatch,
              subTasks: nextSubTasks,
            },
            currentTask: {
              taskId: payload.taskId,
              status: 'processing',
              progress: payload.progress,
              submittedAt: targetNode.data.currentTask?.submittedAt ?? Date.now(),
            },
          });
        }

        const finalStatuses = new Set(['succeed', 'failed', 'abandoned']);
        const allTerminal = nextSubTasks.every((subTask) => finalStatuses.has(subTask.status));
        if (!allTerminal) {
          return;
        }

        const firstFrameRef = findVideoInputImage(
          payload.nodeId,
          'image-first-frame',
          canvasStore.nodes,
          canvasStore.edges
        );
        const tailFrameRef = findVideoInputImage(
          payload.nodeId,
          'image-tail-frame',
          canvasStore.nodes,
          canvasStore.edges
        ) ?? undefined;

        const successfulVariants = Array.from(
          successfulVariantsByBatch.get(payload.batchId)?.values() ?? []
        );
        successfulVariantsByBatch.delete(payload.batchId);

        if (successfulVariants.length > 0) {
          canvasStore.deriveOrUpdateResultBatch({
            sourceGenNodeId: payload.nodeId,
            batchId: payload.batchId,
            kind: 'video',
            snapshotParams: {
              modelId: targetNode.data.modelId,
              prompt: targetNode.data.prompt,
              negativePrompt: targetNode.data.negativePrompt,
              duration: targetNode.data.duration,
              aspectRatio: targetNode.data.aspectRatio,
              extraParams: { ...(targetNode.data.extraParams ?? {}) },
              firstFrameRef: firstFrameRef ?? '',
              tailFrameRef,
            },
            successfulVariants,
          });
          return;
        }

        canvasStore.updateNodeData(payload.nodeId, {
          currentBatch: undefined,
          currentTask: {
            taskId: '',
            status: 'failed',
            progress: 0,
            errorMessage: payload.error ?? 'This batch failed for all variants.',
            errorCode: payload.errorCode,
            submittedAt: targetNode.data.currentTask?.submittedAt ?? Date.now(),
          },
        });
      });
    })();

    return () => {
      unlisten?.();
    };
  }, []);

  if (!isHydrated) {
    return (
      <ReactFlowProvider>
        <div className="w-full h-full bg-bg-dark" />
      </ReactFlowProvider>
    );
  }

  return (
    <ReactFlowProvider>
      <div className="w-full h-full flex flex-col bg-bg-dark">
        <TitleBar
          onSettingsClick={() => {
            setSettingsInitialCategory('general');
            setShowSettings(true);
          }}
          showBackButton={!!currentProjectId}
          onBackClick={closeProject}
        />

        <main className="flex-1 relative overflow-hidden">
          {currentProjectId ? <Canvas /> : <ProjectManager />}
          {/* Floating overlays on top of canvas */}
          {currentProjectId && <LeftStrip />}
          {currentProjectId && <CopilotPanel />}
        </main>

        <SettingsDialog
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          initialCategory={settingsInitialCategory}
        />
        <GlobalErrorDialog
          isOpen={Boolean(globalError)}
          title={globalError?.title ?? ''}
          message={globalError?.message ?? ''}
          details={globalError?.details}
          copyText={globalError?.copyText}
          onClose={() => setGlobalError(null)}
        />
      </div>
    </ReactFlowProvider>
  );
}

export default App;

function findVideoInputImage(
  nodeId: string,
  handleId: string,
  nodes: CanvasNode[],
  edges: CanvasEdge[]
): string | null {
  const sourceNodeId = edges.find(
    (edge) => edge.target === nodeId && edge.targetHandle === handleId
  )?.source;
  if (!sourceNodeId) {
    return null;
  }
  const sourceNode = nodes.find((node) => node.id === sourceNodeId);
  return getNodePrimaryImageUrl(sourceNode ?? null);
}
