import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useThemeStore = create(
    persist(
        (set, get) => ({
            // State
            theme: 'dark', // 'dark' | 'light'

            // Actions
            setTheme: (theme) => {
                set({ theme });
                document.documentElement.setAttribute('data-theme', theme);
            },

            toggleTheme: () => {
                const newTheme = get().theme === 'dark' ? 'light' : 'dark';
                set({ theme: newTheme });
                document.documentElement.setAttribute('data-theme', newTheme);
            },

            // Initialize theme on load
            initializeTheme: () => {
                const { theme } = get();
                document.documentElement.setAttribute('data-theme', theme);
            },
        }),
        {
            name: 'primus-theme-storage',
            onRehydrateStorage: () => (state) => {
                // Apply theme on rehydration
                if (state?.theme) {
                    document.documentElement.setAttribute('data-theme', state.theme);
                }
            },
        }
    )
);

export default useThemeStore;
