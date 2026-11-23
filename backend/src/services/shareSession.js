/** Per-session flag: may past private diary entries be put into AI prompts? Off by default. */
export function createShareSession() {
  const on = new Set();
  return {
    isEnabled: (token) => on.has(token),
    set(token, enabled) {
      if (enabled) on.add(token);
      else on.delete(token);
    },
  };
}
