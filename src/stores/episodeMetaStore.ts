import { create } from 'zustand';

import { episodesApi } from '@/api';

interface EpisodeMetaState {
  episodeId: string | null;
  isDone: boolean;
  loading: boolean;
  setEpisode: (id: string, isDone: boolean) => void;
  toggleDone: () => Promise<{ becameDone: boolean } | null>;
  clear: () => void;
}

export const useEpisodeMetaStore = create<EpisodeMetaState>((set, get) => ({
  episodeId: null,
  isDone: false,
  loading: false,
  setEpisode: (episodeId, isDone) => set({ episodeId, isDone }),
  clear: () => set({ episodeId: null, isDone: false, loading: false }),
  toggleDone: async () => {
    const { episodeId, isDone, loading } = get();
    if (!episodeId || loading) return null;
    const next = !isDone;
    set({ loading: true });
    try {
      await episodesApi.updateEpisodeMeta(episodeId, { is_done: next });
      set({ isDone: next, loading: false });
      return { becameDone: next };
    } catch (e) {
      set({ loading: false });
      throw e;
    }
  },
}));
