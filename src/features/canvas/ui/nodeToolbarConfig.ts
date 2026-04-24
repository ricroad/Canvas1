import { Position } from '@xyflow/react';

export const NODE_TOOLBAR_POSITION = Position.Top;
export const NODE_TOOLBAR_ALIGN = 'center' as const;
export const NODE_TOOLBAR_OFFSET = 25;
export const NODE_TOOLBAR_CLASS = 'pointer-events-auto';
export const NODE_HOVER_TOOLBAR_TOP = -32;
export const NODE_HOVER_TOOLBAR_PANEL_CLASS =
  'pointer-events-auto inline-flex items-center gap-1 rounded-full border border-[rgba(255,255,255,0.14)] bg-surface-dark/96 p-1 shadow-xl backdrop-blur-sm';
export const NODE_HOVER_TOOLBAR_BUTTON_CLASS =
  'inline-flex h-7 items-center gap-1 rounded-full border border-[rgba(255,255,255,0.14)] bg-bg-dark/68 px-2 text-[11px] text-text-dark transition-colors hover:border-[rgba(255,255,255,0.28)] hover:bg-bg-dark';
