export const NODE_CONTROL_CHIP_CLASS = '!h-6 !rounded-md !px-2 !text-[11px] !gap-1';

export const NODE_CONTROL_MODEL_CHIP_CLASS = '!w-auto !justify-start !shrink-0';

export const NODE_CONTROL_PARAMS_CHIP_CLASS = '!w-auto !justify-start !shrink-0';

export const NODE_CONTROL_PRIMARY_BUTTON_CLASS =
  '!h-6 !rounded-md !px-2 !text-[11px] !gap-1 border border-transparent';

export const NODE_CONTROL_ICON_CLASS = 'h-3 w-3';

/*
 * Phase 3.4 – Node Cabin Bar
 * --node-cabin-height: 24px;
 * --node-cabin-bg: rgba(11,11,13,0.04); light mode
 * dark: --node-cabin-bg overridden to var(--brand-ink-900) via .dark
 * --node-cabin-dot-idle: var(--brand-ink-500);
 * --node-cabin-dot-generating: var(--accent);
 * --node-cabin-dot-complete: var(--state-success);
 * --node-cabin-dot-error: var(--state-error);
 */
export const NODE_CABIN_BAR_CLASS =
  'relative h-[var(--node-cabin-height)] bg-[var(--node-cabin-bg)]';

export const NODE_CABIN_DOT_BASE_CLASS =
  'absolute left-2 top-2 h-2 w-2 rounded-full';

export const NODE_CABIN_DOT_STATUS_CLASS = {
  idle: 'bg-[var(--node-cabin-dot-idle)]',
  generating: 'bg-[var(--node-cabin-dot-generating)] animate-[node-cabin-pulse_1s_ease-in-out_infinite]',
  complete: 'bg-[var(--node-cabin-dot-complete)]',
  error: 'bg-[var(--node-cabin-dot-error)]',
} as const;

export const VIDEO_RESULT_BASE_WIDTH = 320;
export const VIDEO_RESULT_TOP_BAR_HEIGHT = 28;
export const VIDEO_RESULT_NODE_RADIUS_CLASS = 'rounded-[var(--node-radius)]';
export const VIDEO_RESULT_NODE_SHELL_CLASS =
  'border-[rgba(15,23,42,0.22)] bg-surface-dark/90 dark:border-[rgba(255,255,255,0.22)]';
export const VIDEO_RESULT_NODE_SELECTED_CLASS =
  'border-accent shadow-[var(--shadow-spotlight)]';
export const VIDEO_RESULT_NODE_HOVER_CLASS =
  'hover:border-[rgba(15,23,42,0.34)] dark:hover:border-[rgba(255,255,255,0.34)]';
export const VIDEO_RESULT_TOP_BAR_CLASS =
  'border-b border-[rgba(255,255,255,0.08)] bg-bg-dark/72 px-2 text-text-dark';
export const VIDEO_RESULT_SURFACE_CLASS = 'bg-bg-dark/55';
export const VIDEO_RESULT_OVERLAY_BUTTON_CLASS =
  'inline-flex items-center justify-center rounded-full border border-[rgba(255,255,255,0.16)] bg-black/55 text-white shadow-lg transition-colors hover:bg-black/72';
export const VIDEO_RESULT_PANEL_CLASS =
  'rounded-xl border border-[rgba(255,255,255,0.12)] bg-surface-dark/96 text-text-dark shadow-2xl backdrop-blur-sm';
export const VIDEO_RESULT_INFO_LABEL_CLASS = 'text-[10px] uppercase tracking-wide text-text-muted/70';
export const VIDEO_RESULT_INFO_VALUE_CLASS = 'text-[11px] text-text-dark';
export const NODE_RESULT_HANDLE_CLASS =
  '!h-2.5 !w-2.5 !border-surface-dark !bg-accent transition-opacity duration-150';
