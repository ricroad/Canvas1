import { create } from 'zustand';

export type AssetCategory =
  | 'all'
  | 'uploadedImage'
  | 'generatedImage'
  | 'generatedVideo'
  | 'storyboard';

interface AssetLibraryState {
  isOpen: boolean;
  selectedCategory: AssetCategory;
  selectedIds: Set<string>;
  open: () => void;
  close: () => void;
  toggle: () => void;
  setCategory: (category: AssetCategory) => void;
  toggleSelection: (id: string) => void;
  clearSelection: () => void;
}

export const useAssetLibraryStore = create<AssetLibraryState>((set) => ({
  isOpen: false,
  selectedCategory: 'all',
  selectedIds: new Set<string>(),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  setCategory: (category) => set({ selectedCategory: category }),
  toggleSelection: (id) =>
    set((state) => {
      const selectedIds = new Set(state.selectedIds);
      if (selectedIds.has(id)) {
        selectedIds.delete(id);
      } else {
        selectedIds.add(id);
      }
      return { selectedIds };
    }),
  clearSelection: () => set({ selectedIds: new Set<string>() }),
}));
