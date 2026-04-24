import { invoke } from '@tauri-apps/api/core';
import { isTauriEnv } from './platform';

export interface RuntimeSystemInfo {
  osName: string;
  osVersion: string;
  osBuild: string;
}

export async function getRuntimeSystemInfo(): Promise<RuntimeSystemInfo | null> {
  if (!isTauriEnv()) return null;

  try {
    return await invoke<RuntimeSystemInfo>('get_runtime_system_info');
  } catch (error) {
    console.warn('failed to get runtime system info from tauri', error);
    return null;
  }
}
