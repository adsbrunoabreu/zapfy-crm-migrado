// SSR-safe localStorage wrapper
const hasWindow = typeof window !== 'undefined';

export const safeStorage = {
  get(key: string): string | null {
    if (!hasWindow) return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    if (!hasWindow) return;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
  remove(key: string): void {
    if (!hasWindow) return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};
