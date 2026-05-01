import { memo, useState, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { LayoutTemplate, Bot, Undo2, Redo2, Hand, Library, MousePointer2, Package, WandSparkles, CircleCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCopilotStore } from '@/stores/copilotStore';
import { useCanvasStore } from '@/stores/canvasStore';
import { useEpisodeMetaStore } from '@/stores/episodeMetaStore';
import { canvasEventBus } from '@/features/canvas/application/canvasServices';
import { openSettingsDialog } from '@/features/settings/settingsEvents';
import { useAssetLibraryStore } from '@/features/asset-library/assetLibraryStore';
import { useShowAssetPanelStore } from '@/features/show-asset-panel/showAssetPanelStore';

/* ----------------------------------------------------------------
 *  Icon button inside the pill
 * ---------------------------------------------------------------- */
interface ToolBtnProps {
  icon: React.ReactNode;
  tooltip: string;
  active?: boolean;
  successActive?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}

const ToolBtn = memo(({ icon, tooltip, active, successActive, disabled, onClick, className }: ToolBtnProps) => {
  const [hover, setHover] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        className={`
          relative flex h-[38px] w-[38px] items-center justify-center
          rounded-[12px] transition-all duration-180 ease-out
          active:scale-[0.88]
          disabled:opacity-25 disabled:pointer-events-none
          ${successActive
            ? 'bg-[rgb(var(--state-success-rgb)_/_0.12)] text-[var(--state-success)] ring-1 ring-inset ring-[var(--state-success)] hover:bg-[rgb(var(--state-success-rgb)_/_0.12)] hover:text-[var(--state-success)]'
            : active
            ? 'bg-[rgb(var(--accent-rgb)_/_0.12)] text-[var(--accent)] ring-1 ring-inset ring-[var(--accent)] hover:bg-[rgb(var(--accent-rgb)_/_0.12)] hover:text-[var(--accent)]'
            : 'bg-transparent text-[var(--copilot-text-secondary)] hover:bg-[var(--strip-btn-hover-bg)] hover:text-[var(--copilot-text-primary)]'
          }
          ${className ?? ''}
        `}
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {icon}
      </button>

      {hover && (
        <div
          className="
            pointer-events-none absolute left-full top-1/2 z-50
            ml-3 -translate-y-1/2 whitespace-nowrap
            rounded-[10px] border border-[color:var(--brand-ink-700)]
            bg-[rgba(11,11,13,0.92)] px-3 py-1.5
            font-mono text-[11px] font-medium text-white
            dark:bg-[rgba(20,20,23,0.95)]
          "
          style={{
            boxShadow: '0 4px 20px rgba(0,0,0,0.12), 0 0 0 0.5px var(--copilot-card-border)',
            backdropFilter: 'blur(20px)',
          }}
        >
          {tooltip}
        </div>
      )}
    </div>
  );
});
ToolBtn.displayName = 'ToolBtn';

const Divider = () => (
  <div className="h-px w-[22px]" style={{ background: 'var(--copilot-divider)' }} />
);

/* ----------------------------------------------------------------
 *  Floating pill toolbar — absolutely positioned over the canvas
 * ---------------------------------------------------------------- */
export const LeftStrip = memo(() => {
  const { t } = useTranslation();
  const copilotOpen = useCopilotStore((s) => s.isOpen);
  const toggleCopilot = useCopilotStore((s) => s.togglePanel);
  const assetLibraryOpen = useAssetLibraryStore((s) => s.isOpen);
  const toggleAssetLibrary = useAssetLibraryStore((s) => s.toggle);
  const showAssetPanelOpen = useShowAssetPanelStore((s) => s.isOpen);
  const toggleShowAssetPanel = useShowAssetPanelStore((s) => s.toggle);
  const canvasToolMode = useCanvasStore((s) => s.canvasToolMode);
  const setCanvasToolMode = useCanvasStore((s) => s.setCanvasToolMode);
  const undo = useCanvasStore((s) => s.undo);
  const redo = useCanvasStore((s) => s.redo);
  const canUndo = useCanvasStore((s) => s.history.past.length > 0);
  const canRedo = useCanvasStore((s) => s.history.future.length > 0);
  const { episodeId, isDone, loading } = useEpisodeMetaStore();
  const [isPopped, setIsPopped] = useState(false);

  const handleToggleDone = useCallback(async () => {
    setIsPopped(true);
    setTimeout(() => setIsPopped(false), 400);
    try {
      const result = await useEpisodeMetaStore.getState().toggleDone();
      if (result?.becameDone) {
        void confetti({ particleCount: 60, angle: 60, spread: 55, origin: { x: 0, y: 0 }, colors: ['#E94E1B','#FF5A2E','#3FCF8E','#F2A93B','#FFFFFF'] });
        void confetti({ particleCount: 60, angle: 120, spread: 55, origin: { x: 1, y: 0 }, colors: ['#E94E1B','#FF5A2E','#3FCF8E','#F2A93B','#FFFFFF'] });
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  return (
    <div
      className="
        absolute left-3.5 top-1/2 z-30 -translate-y-1/2
        flex flex-col items-center gap-[3px]
        rounded-[22px] p-[6px]
      "
      style={{
        background: 'var(--strip-pill-bg)',
        border: '1px solid var(--strip-pill-border)',
        boxShadow: 'var(--strip-pill-shadow)',
        backdropFilter: 'blur(20px) saturate(140%)',
        WebkitBackdropFilter: 'blur(20px) saturate(140%)',
      }}
    >
      <ToolBtn
        icon={<Bot className="h-[17px] w-[17px]" />}
        tooltip={t('copilot.title')}
        active={copilotOpen}
        onClick={useCallback(() => toggleCopilot(), [toggleCopilot])}
      />
      <ToolBtn
        icon={<WandSparkles className="h-[17px] w-[17px]" />}
        tooltip={t('settings.skillsShortcut', { defaultValue: 'Storyboard Skills' })}
        onClick={() => openSettingsDialog({ category: 'skills' })}
      />

      <Divider />

      <ToolBtn
        icon={<MousePointer2 className="h-[17px] w-[17px]" />}
        tooltip={t('canvas.toolbar.selectTool', { defaultValue: '选择工具' })}
        active={canvasToolMode === 'select'}
        onClick={() => setCanvasToolMode('select')}
      />
      <ToolBtn
        icon={<Hand className="h-[17px] w-[17px]" />}
        tooltip={t('canvas.toolbar.handTool', { defaultValue: '手形工具' })}
        active={canvasToolMode === 'pan'}
        onClick={() => setCanvasToolMode('pan')}
      />
      <ToolBtn
        icon={<LayoutTemplate className="h-[17px] w-[17px]" />}
        tooltip={t('canvas.toolbar.autoLayout', { defaultValue: '一键排版' })}
        onClick={() => canvasEventBus.publish('canvas/auto-layout', undefined)}
      />

      <Divider />

      <ToolBtn
        icon={<Library className="h-[17px] w-[17px]" />}
        tooltip={t('assetLibrary.title')}
        active={assetLibraryOpen}
        onClick={toggleAssetLibrary}
      />
      <ToolBtn
        icon={<Package size={18} />}
        tooltip={t('showAssetPanel.title')}
        active={showAssetPanelOpen}
        onClick={toggleShowAssetPanel}
      />

      <Divider />

      <ToolBtn
        icon={<Undo2 className="h-[15px] w-[15px]" />}
        tooltip={t('common.undo', 'Undo')}
        disabled={!canUndo}
        onClick={undo}
      />
      <ToolBtn
        icon={<Redo2 className="h-[15px] w-[15px]" />}
        tooltip={t('common.redo', 'Redo')}
        disabled={!canRedo}
        onClick={redo}
      />

      <Divider />

      <ToolBtn
        icon={<CircleCheck className="h-[17px] w-[17px]" />}
        tooltip={isDone ? t('canvas.alreadyDone') : t('canvas.markDone')}
        active={isDone}
        successActive={isDone}
        disabled={!episodeId || loading}
        onClick={handleToggleDone}
        className={isPopped ? 'tool-btn-popped' : ''}
      />
    </div>
  );
});
LeftStrip.displayName = 'LeftStrip';
