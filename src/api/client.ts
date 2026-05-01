import { invoke } from '@tauri-apps/api/core';

// Web migration: replace this file with fetch + JWT; business layer unchanged.
export async function call<T>(
  command: string,
  args?: Record<string, unknown>
): Promise<T> {
  return await invoke<T>(command, args);
}

export function msToIso(ms: number): string {
  return new Date(ms).toISOString();
}

export const apiClient = { call };
