import { useCallback, useEffect, useRef, useState } from 'react';
import { type Preferences, defaultPreferences } from '@nigord/shared';
import { bridge } from './bridge.js';

export interface PreferencesHandle {
  prefs: Preferences;
  loaded: boolean;
  /** Applies a patch immediately and persists it shortly after. */
  update: (patch: Partial<Preferences>) => void;
}

/**
 * Preferences live in the main process, which owns the file and its fallback to
 * defaults (task 6.7). The renderer holds a copy so controls respond to the
 * keystroke rather than to the round trip.
 *
 * Writes are coalesced because the main process persists synchronously: a
 * volume slider emits an event per pixel, and forwarding each one would block
 * main on a disk write for the whole drag.
 */
const FLUSH_DELAY_MS = 300;

export function usePreferences(): PreferencesHandle {
  const [prefs, setPrefs] = useState<Preferences>(defaultPreferences);
  const [loaded, setLoaded] = useState(false);

  const pending = useRef<Partial<Preferences>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const patch = pending.current;
    pending.current = {};
    if (Object.keys(patch).length === 0) return;
    // The stored value wins: main normalises through the schema, and adopting
    // its answer is what keeps the two copies from drifting.
    void bridge.invoke('prefs:set', patch).then(setPrefs);
  }, []);

  useEffect(() => {
    void bridge.invoke('prefs:get', {}).then((stored) => {
      setPrefs(stored);
      setLoaded(true);
    });
  }, []);

  // A window closed mid-drag must not lose the last change.
  useEffect(() => {
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      flush();
    };
  }, [flush]);

  const update = useCallback(
    (patch: Partial<Preferences>) => {
      setPrefs((current) => ({ ...current, ...patch }));
      pending.current = { ...pending.current, ...patch };

      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(flush, FLUSH_DELAY_MS);
    },
    [flush],
  );

  return { prefs, loaded, update };
}
