import { saveSourceToDirectory } from '@/commands/image';
import { openFileDialog } from '@/commands/web/dialog';

import type { AssetItem } from './scanAssets';

export interface DownloadAssetsResult {
  targetDir: string | null;
  succeeded: string[];
  failed: Array<{ item: AssetItem; error: string }>;
}

function resolveExtension(item: AssetItem): string | undefined {
  if (item.kind === 'video') {
    return 'mp4';
  }

  return undefined;
}

export async function downloadAssets(items: AssetItem[]): Promise<DownloadAssetsResult> {
  const empty: DownloadAssetsResult = { targetDir: null, succeeded: [], failed: [] };
  if (items.length === 0) {
    return empty;
  }

  const targetDir = await openFileDialog({ directory: true });
  if (!targetDir) {
    return empty;
  }

  const succeeded: string[] = [];
  const failed: DownloadAssetsResult['failed'] = [];

  for (const item of items) {
    try {
      const savedPath = await saveSourceToDirectory(
        item.sourceUrl,
        targetDir,
        item.suggestedFileName,
        resolveExtension(item)
      );
      succeeded.push(savedPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failed.push({ item, error: message });
      console.error(`[AssetLibrary] failed to save ${item.id}:`, message);
    }
  }

  console.info(
    `[AssetLibrary] downloaded ${succeeded.length}/${items.length} item(s) to ${targetDir}` +
      (failed.length > 0 ? ` (${failed.length} failed)` : '')
  );
  return { targetDir, succeeded, failed };
}
