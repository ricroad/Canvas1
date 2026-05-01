import type { StorageAdapter } from './adapter';
import { tauriFsAdapter } from './tauri-fs-adapter';

export const storage: StorageAdapter = tauriFsAdapter;
export type { StorageAdapter };
