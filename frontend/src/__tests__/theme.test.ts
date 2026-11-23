import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getInitialTheme, applyTheme } from '../lib/theme';

function mockMatchMedia(dark: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: dark && q.includes('dark'),
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.classList.remove('dark');
    mockMatchMedia(false);
  });

  it('reads the stored theme', () => {
    localStorage.setItem('clio.theme', 'clio-dark');
    expect(getInitialTheme()).toBe('clio-dark');
  });

  it('falls back to light when no stored value and system is light', () => {
    expect(getInitialTheme()).toBe('clio-light');
  });

  it('falls back to dark when system prefers dark', () => {
    mockMatchMedia(true);
    expect(getInitialTheme()).toBe('clio-dark');
  });

  it('applyTheme sets attribute, dark class and persists', () => {
    applyTheme('clio-dark');
    expect(document.documentElement.dataset.theme).toBe('clio-dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('clio.theme')).toBe('clio-dark');
    applyTheme('clio-light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
