import { memo, useState, useCallback } from 'react';
import { LayoutTemplate, Bot, Undo2, Redo2, Hand, Library, MousePointer2, WandSparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCopilotStore } from '@/stores/copilotStore';
import { useCanvasStore } from '@/stores/canvasStore';
import { canvasEventBus } from '@/features/canvas/application/canvasServices';
import { openSettingsDialog } from '@/features/settings/settingsEvents';
import { useAssetLibraryStore } from '@/features/asset-library/assetLibraryStore';

/* ----------------------------------------------------------------
 *  Icon button inside the pill
 * ---------------------------------------------------------------- */
interface ToolBtnProps {
  icon: React.ReactNode;
  tooltip: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

const ToolBtn = memo(({ icon, tooltip, active, disabled, onClick }: ToolBtnProps) => {
  const [hover, setHover] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        className="
          relative flex h-[38px] w-[38px] items-center justify-center
          rounded-[12px] transition-all duration-180 ease-out
          active:scale-[0.88]
          disabled:opacity-25 disabled:pointer-events-none
        "
        style={{
          background: active
            ? 'rgba(var(--accent-rgb) / 0.14)'
            : hover
              ? 'var(--strip-btn-hover-bg)'
              : 'transparent',
          color: active
            ? 'var(--accent)'
            : hover
              ? 'var(--copilot-text-primary)'
              : 'var(--copilot-text-secondary)',
        }}
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
            rounded-[10px] px-3 py-1.5 text-[11px] font-medium
          "
          style={{
            background: 'var(--copilot-card-bg)',
            color: 'var(--copilot-text-primary)',
            border: '1px solid var(--copilot-card-border)',
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
  const canvasToolMode = useCanvasStore((s) => s.canvasToolMode);
  const setCanvasToolMode = useCanvasStore((s) => s.setCanvasToolMode);
  const undo = useCanvasStore((s) => s.undo);
  const redo = useCanvasStore((s) => s.redo);
  const canUndo = useCanvasStore((s) => s.history.past.length > 0);
  const canRedo = useCanvasStore((s) => s.history.future.length > 0);

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
        backdropFilter: 'blur(28px) saturate(1.8)',
        WebkitBackdropFilter: 'blur(28px) saturate(1.8)',
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
    </div>
  );
});
LeftStrip.displayName = 'LeftStrip';
