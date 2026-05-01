import { call, msToIso } from './client';
import type { Episode, PageRequest, PageResponse } from './types';

interface RawEpisode {
  id: string;
  show_id: string;
  user_id: string;
  title: string;
  episode_number: number | null;
  node_count: number;
  is_done: boolean;
  completed_at: number | null;
  created_at: number;
  updated_at: number;
}

interface RawEpisodePageResponse {
  items: RawEpisode[];
  page: number;
  page_size: number;
  total: number;
}

export interface ListEpisodesRequest extends PageRequest {
  show_id: string;
}

export interface CreateEpisodeInput {
  show_id: string;
  title: string;
  episode_number?: number | null;
}

export interface UpdateEpisodeInput {
  title: string;
  episode_number?: number | null;
}

export interface UpdateEpisodeMetaInput {
  title?: string;
  episode_number?: number | null;
  is_done?: boolean;
}

function toEpisode(raw: RawEpisode): Episode {
  return {
    ...raw,
    completed_at: raw.completed_at != null ? msToIso(raw.completed_at) : null,
    created_at: msToIso(raw.created_at),
    updated_at: msToIso(raw.updated_at),
  };
}

function toEpisodePage(response: RawEpisodePageResponse): PageResponse<Episode> {
  return {
    ...response,
    items: response.items.map(toEpisode),
  };
}

export async function listEpisodes(
  req: ListEpisodesRequest
): Promise<PageResponse<Episode>> {
  const response = await call<RawEpisodePageResponse>('list_episodes', {
    showId: req.show_id,
    page: req.page,
    pageSize: req.page_size,
  });
  return toEpisodePage(response);
}

export async function createEpisode(input: CreateEpisodeInput): Promise<Episode> {
  const episode = await call<RawEpisode>('create_episode', {
    showId: input.show_id,
    title: input.title,
    episodeNumber: input.episode_number,
  });
  return toEpisode(episode);
}

export async function getEpisode(id: string): Promise<Episode> {
  const episode = await call<RawEpisode>('get_episode', { id });
  return toEpisode(episode);
}

export async function updateEpisode(
  id: string,
  input: UpdateEpisodeInput
): Promise<Episode> {
  return updateEpisodeMeta(id, input);
}

export async function updateEpisodeMeta(
  id: string,
  input: UpdateEpisodeMetaInput
): Promise<Episode> {
  const currentEpisode =
    input.title === undefined || input.episode_number === undefined
      ? await getEpisode(id)
      : null;
  const episode = await call<RawEpisode>('update_episode_meta', {
    id,
    title: input.title ?? currentEpisode?.title,
    episodeNumber:
      input.episode_number !== undefined
        ? input.episode_number
        : currentEpisode?.episode_number,
    isDone: input.is_done,
  });
  return toEpisode(episode);
}

export async function deleteEpisode(id: string): Promise<void> {
  await call<void>('delete_episode', { id });
}
