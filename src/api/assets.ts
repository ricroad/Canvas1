import { call, msToIso } from './client';
import type { Asset, AssetCategory, PageRequest, PageResponse } from './types';

interface RawAsset {
  id: string;
  show_id: string;
  user_id: string;
  category: AssetCategory;
  name: string;
  storage_key: string;
  mime_type: string;
  size_bytes: number;
  thumbnail_key: string | null;
  metadata_json: string | null;
  created_at: number;
  updated_at: number;
}

interface RawAssetPageResponse {
  items: RawAsset[];
  page: number;
  page_size: number;
  total: number;
}

export interface ListAssetsRequest extends PageRequest {
  show_id: string;
  category?: AssetCategory;
}

export interface CreateAssetInput {
  show_id: string;
  category: AssetCategory;
  name: string;
  storage_key: string;
  mime_type: string;
  size_bytes: number;
  thumbnail_key?: string | null;
  metadata_json?: string | null;
}

function toAsset(raw: RawAsset): Asset {
  return {
    ...raw,
    created_at: msToIso(raw.created_at),
    updated_at: msToIso(raw.updated_at),
  };
}

function toAssetPage(response: RawAssetPageResponse): PageResponse<Asset> {
  return {
    ...response,
    items: response.items.map(toAsset),
  };
}

export async function listAssets(req: ListAssetsRequest): Promise<PageResponse<Asset>> {
  const response = await call<RawAssetPageResponse>('list_assets', {
    showId: req.show_id,
    category: req.category,
    page: req.page,
    pageSize: req.page_size,
  });
  return toAssetPage(response);
}

export async function createAsset(input: CreateAssetInput): Promise<Asset> {
  const asset = await call<RawAsset>('create_asset', {
    showId: input.show_id,
    category: input.category,
    name: input.name,
    storageKey: input.storage_key,
    mimeType: input.mime_type,
    sizeBytes: input.size_bytes,
    thumbnailKey: input.thumbnail_key,
    metadataJson: input.metadata_json,
  });
  return toAsset(asset);
}

export async function getAsset(id: string): Promise<Asset> {
  const asset = await call<RawAsset>('get_asset', { id });
  return toAsset(asset);
}

export async function deleteAsset(id: string): Promise<void> {
  await call<void>('delete_asset', { id });
}
