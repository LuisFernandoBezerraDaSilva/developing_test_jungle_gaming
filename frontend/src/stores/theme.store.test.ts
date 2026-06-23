import { describe, it, expect, beforeEach } from 'vitest';
import { useThemeStore } from './theme.store';

beforeEach(() => {
  useThemeStore.setState({ theme: 'dark' });
  document.documentElement.classList.remove('light');
});

describe('theme.store', () => {
  it('defaults to dark', () => {
    expect(useThemeStore.getState().theme).toBe('dark');
    expect(document.documentElement.classList.contains('light')).toBe(false);
  });

  it('toggles to light and back, syncing the html class', () => {
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);

    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe('dark');
    expect(document.documentElement.classList.contains('light')).toBe(false);
  });

  it('setTheme applies the requested theme', () => {
    useThemeStore.getState().setTheme('light');
    expect(useThemeStore.getState().theme).toBe('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
  });
});
