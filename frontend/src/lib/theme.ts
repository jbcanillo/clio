export type Theme = 'clio-light' | 'clio-dark';

const KEY = 'clio.theme';

export function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === 'clio-light' || stored === 'clio-dark') return stored;
  } catch {
    /* storage unavailable */
  }
  const dark =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  return dark ? 'clio-dark' : 'clio-light';
}

export function applyTheme(t: Theme): void {
  const root = document.documentElement;
  root.dataset.theme = t;
  root.classList.toggle('dark', t === 'clio-dark');
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* storage unavailable */
  }
}
