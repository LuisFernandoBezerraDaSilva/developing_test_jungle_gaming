import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Tema da aplicação (client state, Zustand + persist). O dark mode é o padrão
 * (estética cassino); o tema claro é alternável. A classe `.light` no elemento
 * <html> dispara a paleta clara definida em index.css.
 */

export type Theme = 'dark' | 'light';

/** Aplica/remove a classe `.light` no <html> conforme o tema. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle('light', theme === 'light');
}

type ThemeState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      setTheme(theme) {
        applyTheme(theme);
        set({ theme });
      },
      toggleTheme() {
        const next: Theme = get().theme === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        set({ theme: next });
      },
    }),
    {
      name: 'crash-game-theme',
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme);
      },
    },
  ),
);
