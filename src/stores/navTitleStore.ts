import { create } from 'zustand';

interface NavTitleState {
  showTitle: string | null;
  episodeTitle: string | null;
  setShowTitle: (title: string | null) => void;
  setEpisodeTitle: (title: string | null) => void;
  clear: () => void;
}

export const useNavTitleStore = create<NavTitleState>((set) => ({
  showTitle: null,
  episodeTitle: null,
  setShowTitle: (showTitle) => set({ showTitle }),
  setEpisodeTitle: (episodeTitle) => set({ episodeTitle }),
  clear: () => set({ showTitle: null, episodeTitle: null }),
}));
