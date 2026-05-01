import { convertFileSrc, invoke } from '@tauri-apps/api/core';

import type { StorageAdapter } from './adapter';

function readBlobAsBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => {
      reject(reader.error ?? new Error('Failed to read file'));
    };

    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Expected FileReader to return a data URL'));
        return;
      }

      const [, bytesBase64 = reader.result] = reader.result.split(',', 2);
      resolve(bytesBase64);
    };

    reader.readAsDataURL(file);
  });
}

class TauriFsAdapter implements StorageAdapter {
  async putObject(input: {
    showId: string;
    assetId: string;
    file: File | Blob;
    mimeType: string;
  }): Promise<{ storage_key: string }> {
    const fileName = input.file instanceof File ? input.file.name : 'asset.bin';
    const bytesBase64 = await readBlobAsBase64(input.file);
    const storageKey = await invoke<string>('storage_put_object', {
      showId: input.showId,
      assetId: input.assetId,
      fileName,
      bytesBase64,
    });

    return { storage_key: storageKey };
  }

  async getObjectUrl(storage_key: string): Promise<string> {
    const resolvedPath = await invoke<string>('storage_resolve_url', { storageKey: storage_key });
    return convertFileSrc(resolvedPath);
  }

  async deleteObject(storage_key: string): Promise<void> {
    await invoke('storage_delete_object', { storageKey: storage_key });
  }
}

export const tauriFsAdapter = new TauriFsAdapter();
