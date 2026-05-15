import { create } from 'zustand';

const useFiltersStore = create((set) => ({
  search: '',
  tags: [],
  borrow: false,
  free: true,
  genre: null,
  launcher: null,

  setSearch: (search) => set({ search }),

  toggleTag: (tag) =>
    set((s) => ({
      tags: s.tags.includes(tag) ? s.tags.filter((t) => t !== tag) : [...s.tags, tag],
    })),
  setTags: (tags) => set({ tags }),

  setBorrow: (borrow) => set({ borrow }),
  setFree: (free) => set({ free }),
  setGenre: (genre) => set({ genre }),
  setLauncher: (launcher) => set({ launcher }),

  reset: () =>
    set({ search: '', tags: [], borrow: false, free: true, genre: null, launcher: null }),
}));

export default useFiltersStore;
