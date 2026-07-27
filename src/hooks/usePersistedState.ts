import { useEffect, useState } from 'react';

/**
 * Estado persistido em localStorage. SSR-safe.
 * Use chaves prefixadas (ex: "masterDashboard.crossTab") para evitar colisão.
 */
export function usePersistedState<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initial;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw == null) return initial;
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* noop — quota/private mode */
    }
  }, [key, value]);

  return [value, setValue];
}
