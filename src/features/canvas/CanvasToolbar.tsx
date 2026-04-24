import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Lock,
  Unlock,
  Trash2,
  Hand,
  MousePointer2,
  Wand2,
} from 'lucide-react';
import { useReactFlow } from '@xyflow/react';

import { CANVAS_NODE_TYPES } from '@/features/canvas/domain/canvasNodes';
import { useCanvasStore } from '@/stores/canvasStore';

interface CanvasToolbarProps {
  isLocked: boolean;
  onToggleLock: () => void;
  toolMode: 'select' | 'pan';
  onToolModeChange: (mode: 'select' | 'pan') => void;
  onAutoLayout: () => void;
  autoLayoutDisabled?: boolean;
}

export const CanvasToolbar = memo(({
  isLocked,
  onToggleLock,
  toolMode,
  onToolModeChange,
  onAutoLayout,
  autoLayoutDisabled = false,
}: CanvasToolbarProps) => {
  const { t } = useTranslation();
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const addNode = useCanvasStore((state) => state.addNode);
  const clearCanvas = useCanvasStore((state) => state.clearCanvas);

  const handleAddNode = useCallback(() => {
    const x = Math.random() * 320 + 120;
    const y = Math.random() * 260 + 120;
    addNode(CANVAS_NODE_TYPES.imageEdit, { x, y });
  }, [addNode]);

  return (
    <div className="absolute left-1/2 top-4 z-10 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-border-dark bg-surface-dark px-2 py-1.5 shadow-lg">
      <button
        onClick={handleAddNode}
        disabled={isLocked}
        className={`
          flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors duration-200
          ${
            isLocked
              ? 'cursor-not-allowed bg-border-dark text-text-muted'
              : 'bg-accent text-white hover:bg-accent/80'
          }
        `}
      >
        <Plus className="h-4 w-4" />
        {t('canvas.addImage')}
      </button>

      <div className="h-6 w-px bg-border-dark" />

      <div className="flex items-center gap-1 rounded-md bg-bg-dark/70 p-1">
        <button
          onClick={() => onToolModeChange('select')}
          className={`rounded p-1.5 transition-colors ${
            toolMode === 'select'
              ? 'bg-accent text-white'
              : 'text-text-muted hover:bg-surface-dark'
          }`}
          title={t('canvas.toolbar.selectTool', { defaultValue: '选择工具' })}
        >
          <MousePointer2 className="h-4 w-4" />
        </button>

        <button
          onClick={() => onToolModeChange('pan')}
          className={`rounded p-1.5 transition-colors ${
            toolMode === 'pan'
              ? 'bg-accent text-white'
              : 'text-text-muted hover:bg-surface-dark'
          }`}
          title={t('canvas.toolbar.handTool', { defaultValue: '手形工具' })}
        >
          <Hand className="h-4 w-4" />
        </button>
      </div>

      <button
        onClick={onAutoLayout}
        disabled={isLocked || autoLayoutDisabled}
        className="rounded p-1.5 transition-colors hover:bg-bg-dark disabled:opacity-50"
        title={t('canvas.toolbar.autoLayout', { defaultValue: '自动排布' })}
      >
        <Wand2 className="h-4 w-4 text-text-muted" />
      </button>

      <div className="h-6 w-px bg-border-dark" />

      <button
        onClick={() => zoomIn()}
        disabled={isLocked}
        className="rounded p-1.5 transition-colors hover:bg-bg-dark disabled:opacity-50"
        title={t('canvas.toolbar.zoomIn')}
      >
        <ZoomIn className="h-4 w-4 text-text-muted" />
      </button>

      <button
        onClick={() => zoomOut()}
        disabled={isLocked}
        className="rounded p-1.5 transition-colors hover:bg-bg-dark disabled:opacity-50"
        title={t('canvas.toolbar.zoomOut')}
      >
        <ZoomOut className="h-4 w-4 text-text-muted" />
      </button>

      <button
        onClick={() => fitView({ padding: 0.2 })}
        className="rounded p-1.5 transition-colors hover:bg-bg-dark"
        title={t('canvas.toolbar.fitView')}
      >
        <Maximize2 className="h-4 w-4 text-text-muted" />
      </button>

      <div className="h-6 w-px bg-border-dark" />

      <button
        onClick={onToggleLock}
        className="rounded p-1.5 transition-colors hover:bg-bg-dark"
        title={isLocked ? t('canvas.toolbar.unlock') : t('canvas.toolbar.lock')}
      >
        {isLocked ? <Lock className="h-4 w-4 text-accent" /> : <Unlock className="h-4 w-4 text-text-muted" />}
      </button>

      <button
        onClick={clearCanvas}
        disabled={isLocked}
        className="rounded p-1.5 transition-colors hover:bg-red-500/10 disabled:opacity-50"
        title={t('common.delete')}
      >
        <Trash2 className="h-4 w-4 text-red-500" />
      </button>
    </div>
  );
});

CanvasToolbar.displayName = 'CanvasToolbar';
