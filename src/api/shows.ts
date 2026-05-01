import { call, msToIso } from './client';
import type { PageRequest, PageResponse, Show } from './types';

interface RawShow {
  id: string;
  user_id: string;
  org_id: string | null;
  title: string;
  description: string | null;
  cover_url: string | null;
  created_at: number;
  updated_at: number;
}

interface RawShowPageResponse {
  items: RawShow[];
  page: number;
  page_size: number;
  total: number;
}

export interface CreateShowInput {
  title: string;
  description?: string | null;
}

export interface UpdateShowInput {
  title: string;
  description?: string | null;
  cover_url?: string | null;
}

function toShow(raw: RawShow): Show {
  return {
    ...raw,
    created_at: msToIso(raw.created_at),
    updated_at: msToIso(raw.updated_at),
  };
}

function toShowPage(response: RawShowPageResponse): PageResponse<Show> {
  return {
    ...response,
    items: response.items.map(toShow),
  };
}

export async function listShows(req?: PageRequest): Promise<PageResponse<Show>> {
  const response = await call<RawShowPageResponse>('list_shows', {
    page: req?.page,
    pageSize: req?.page_size,
  });
  return toShowPage(response);
}

export async function createShow(input: CreateShowInput): Promise<Show> {
  const show = await call<RawShow>('create_show', {
    title: input.title,
    description: input.description,
  });
  return toShow(show);
}

export async function getShow(id: string): Promise<Show> {
  const show = await call<RawShow>('get_show', { id });
  return toShow(show);
}

export async function updateShow(id: string, input: UpdateShowInput): Promise<Show> {
  const show = await call<RawShow>('update_show', {
    id,
    title: input.title,
    description: input.description,
    coverUrl: input.cover_url,
  });
  return toShow(show);
}

export async function deleteShow(id: string): Promise<void> {
  await call<void>('delete_show', { id });
}
