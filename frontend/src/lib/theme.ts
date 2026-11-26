export type Theme = 'clio-light' | 'clio-dark';

const KEY = 'clio.theme';

// Dark ("cosmos", matching the banner) is the brand default; light is opt-in from the avatar menu.
export function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === 'clio-light' || stored === 'clio-dark') return stored;
  } catch {
    /* storage unavailable */
  }
  return 'clio-dark';
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
