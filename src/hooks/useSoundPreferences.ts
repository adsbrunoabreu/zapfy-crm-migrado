import { useEffect, useState, useCallback } from 'react';

export type SoundPlayWhen = 'always' | 'unfocused';

export interface SoundPreferences {
  enabled: boolean;
  volume: number; // 0..1
  playWhen: SoundPlayWhen;
}

const STORAGE_KEY = 'crm.notification-sound';
const DEFAULTS: SoundPreferences = {
  enabled: true,
  volume: 0.7,
  playWhen: 'always',
};

function readPrefs(): SoundPreferences {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULTS.enabled,
      volume:
        typeof parsed.volume === 'number' && parsed.volume >= 0 && parsed.volume <= 1
          ? parsed.volume
          : DEFAULTS.volume,
      playWhen:
        parsed.playWhen === 'always' || parsed.playWhen === 'unfocused'
          ? parsed.playWhen
          : DEFAULTS.playWhen,
    };
  } catch {
    return DEFAULTS;
  }
}

/**
 * Per-device, per-user notification sound preferences.
 * Persisted in localStorage. Synced across tabs via the `storage` event
 * and across same-tab consumers via a CustomEvent.
 */
export function useSoundPreferences() {
  const [prefs, setPrefs] = useState<SoundPreferences>(readPrefs);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setPrefs(readPrefs());
    };
    const onLocal = () => setPrefs(readPrefs());
    window.addEventListener('storage', onStorage);
    window.addEventListener('crm:sound-prefs-changed', onLocal as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('crm:sound-prefs-changed', onLocal as EventListener);
    };
  }, []);

  const update = useCallback((patch: Partial<SoundPreferences>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        window.dispatchEvent(new CustomEvent('crm:sound-prefs-changed'));
      } catch {
        // ignore quota errors
      }
      return next;
    });
  }, []);

  return { prefs, update };
}

/** Read prefs imperatively (for non-reactive consumers like the audio hook). */
export function getSoundPreferences(): SoundPreferences {
  return readPrefs();
}

/**
 * Plays the WhatsApp-style two-tone ping using WebAudio.
 * Standalone helper so the settings "Test" button does not depend on
 * the realtime hook. Requires that the user has interacted with the page.
 */
export function playNotificationPing(volume = 0.7) {
  try {
    const Ctx =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx: AudioContext = new Ctx();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const t0 = ctx.currentTime;
    const v = Math.max(0, Math.min(1, volume));

    const playTone = (
      startAt: number,
      freq: number,
      duration: number,
      gain: number
    ) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startAt);
      g.gain.setValueAtTime(0, startAt);
      g.gain.linearRampToValueAtTime(gain * v, startAt + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + duration + 0.02);
    };

    playTone(t0, 1320, 0.13, 0.18);
    playTone(t0 + 0.11, 990, 0.16, 0.16);

    // Close context shortly after to free resources
    setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch {
    // ignore
  }
}
