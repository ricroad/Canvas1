/**
 * Web-safe wrappers for Tauri dialog and opener plugins.
 * In web mode: file picker uses <input type="file">, URLs open via window.open().
 * In Tauri mode: delegates to the real plugins.
 */

import { isTauriEnv } from '../platform';

// ── File open dialog ─────────────────────────────────────────────────────────

export interface OpenDialogOptions {
  multiple?: boolean;
  directory?: boolean;
  filters?: { name: string; extensions: string[] }[];
}

/**
 * Opens a file picker.
 * - Tauri: uses @tauri-apps/plugin-dialog
 * - Web: uses a hidden <input type="file">
 * Returns the selected file path (Tauri) or a File object URL (Web), or null.
 */
export async function openFileDialog(
  options?: OpenDialogOptions,
): Promise<string | null> {
  if (isTauriEnv()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const result = await open({
      multiple: options?.multiple ?? false,
      directory: options?.directory ?? false,
      filters: options?.filters,
    });
    if (!result || typeof result !== 'string') return null;
    return result;
  }

  // Web fallback: <input type="file">
  return new Promise<string | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (options?.filters) {
      const exts = options.filters.flatMap((f) => f.extensions.map((e) => `.${e}`));
      input.accept = exts.join(',');
    }
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      // Store the File object on a global map so we can read it later
      const url = URL.createObjectURL(file);
      _webFileMap.set(url, file);
      resolve(url);
    };
    input.click();
  });
}

/** Map of blob URLs → File objects for later reading in Web mode */
const _webFileMap = new Map<string, File>();

/** Get the File object for a blob URL created by openFileDialog */
export function getWebFile(blobUrl: string): File | undefined {
  return _webFileMap.get(blobUrl);
}

// ── Save dialog ──────────────────────────────────────────────────────────────

export interface SaveDialogOptions {
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
}

export async function saveFileDialog(
  _options?: SaveDialogOptions,
): Promise<string | null> {
  if (isTauriEnv()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    return (await save(_options)) ?? null;
  }
  // Web: no save dialog, just return a placeholder name
  return _options?.defaultPath ?? 'download';
}

// ── Open URL ─────────────────────────────────────────────────────────────────

export async function openUrl(url: string): Promise<void> {
  if (isTauriEnv()) {
    const { openUrl: tauriOpenUrl } = await import('@tauri-apps/plugin-opener');
    await tauriOpenUrl(url);
    return;
  }
  window.open(url, '_blank', 'noopener');
}

// ── Open / reveal path (desktop only) ────────────────────────────────────────

export async function openPath(path: string): Promise<void> {
  if (isTauriEnv()) {
    const { openPath: tauriOpenPath } = await import('@tauri-apps/plugin-opener');
    await tauriOpenPath(path);
    return;
  }
  console.warn('openPath is not supported in Web mode:', path);
}

export async function revealItemInDir(path: string): Promise<void> {
  if (isTauriEnv()) {
    const { revealItemInDir: tauriReveal } = await import('@tauri-apps/plugin-opener');
    await tauriReveal(path);
    return;
  }
  console.warn('revealItemInDir is not supported in Web mode:', path);
}
