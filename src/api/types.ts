export interface Show {
  id: string; user_id: string; org_id: string | null; title: string;
  description: string | null; cover_url: string | null;
  created_at: string; updated_at: string;  // ISO 8601
}

export interface Episode {
  id: string; show_id: string; user_id: string; title: string;
  episode_number: number | null; node_count: number;
  created_at: string; updated_at: string;
}

export type AssetCategory = 'character' | 'scene' | 'prop' | 'other';

export interface Asset {
  id: string; show_id: string; user_id: string; category: AssetCategory;
  name: string; storage_key: string; mime_type: string; size_bytes: number;
  thumbnail_key: string | null; metadata_json: string | null;
  created_at: string; updated_at: string;
}

export interface PageRequest { page?: number; page_size?: number; }

export interface PageResponse<T> { items: T[]; page: number; page_size: number; total: number; }
