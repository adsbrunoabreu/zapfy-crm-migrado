import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';

export type UIScale = 80 | 90 | 100;

const SCALE_OPTIONS: UIScale[] = [80, 90, 100];
const DEFAULT_SCALE: UIScale = 80;
const STORAGE_KEY = 'credflow-ui-scale';

interface UIScaleContextType {
  scale: UIScale;
  setScale: (scale: UIScale) => void;
  options: UIScale[];
}

const UIScaleContext = createContext<UIScaleContextType>({
  scale: DEFAULT_SCALE,
  setScale: () => {},
  options: SCALE_OPTIONS,
});

const isValidScale = (v: unknown): v is UIScale =>
  typeof v === 'number' && SCALE_OPTIONS.includes(v as UIScale);

export function UIScaleProvider({ children }: { children: ReactNode }) {
  const [scale, setScaleState] = useState<UIScale>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const parsed = stored ? Number(stored) : NaN;
      return isValidScale(parsed) ? parsed : DEFAULT_SCALE;
    } catch {
      return DEFAULT_SCALE;
    }
  });

  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', `${scale}%`);
    try {
      localStorage.setItem(STORAGE_KEY, String(scale));
    } catch {
      /* ignore */
    }
  }, [scale]);

  const setScale = useCallback((next: UIScale) => {
    if (isValidScale(next)) setScaleState(next);
  }, []);

  return (
    <UIScaleContext.Provider value={{ scale, setScale, options: SCALE_OPTIONS }}>
      {children}
    </UIScaleContext.Provider>
  );
}

export const useUIScale = () => useContext(UIScaleContext);
