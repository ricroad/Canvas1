import { invoke } from '@tauri-apps/api/core';
import { isTauriEnv } from './platform';

export async function checkLatestReleaseTag(): Promise<string | null> {
  if (!isTauriEnv()) return null;
  const tag = await invoke<string | null>('check_latest_release_tag');
  return tag ? tag.trim() : null;
}
