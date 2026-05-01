export interface StorageAdapter {
  putObject(input: {
    showId: string;
    assetId: string;
    file: File | Blob;
    mimeType: string;
  }): Promise<{ storage_key: string }>;
  getObjectUrl(storage_key: string): Promise<string>;
  deleteObject(storage_key: string): Promise<void>;
}
