/**
 * Platform detection utilities.
 * Centralises the Tauri-vs-Web check so every adapter can import from one place.
 */

let _isTauriCached: boolean | null = null;

export function isTauriEnv(): boolean {
  if (_isTauriCached !== null) return _isTauriCached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _isTauriCached = Boolean((window as any).__TAURI_INTERNALS__);
  } catch {
    _isTauriCached = false;
  }
  return _isTauriCached;
}
