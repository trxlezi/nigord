import { useCallback, useEffect, useState } from 'react';
import { type Preferences, defaultPreferences } from '@nigord/shared';
import { bridge } from './bridge.js';

export interface PreferencesHandle {
  prefs: Preferences;
  loaded: boolean;
  /** Persists a patch through the main process and adopts what it returns. */
  update: (patch: Partial<Preferences>) => Promise<void>;
}

/**
 * Preferences live in the main process, which owns the file and its fallback to
 * defaults (task 6.7). The renderer holds a copy and always adopts the value
 * main returns, so a rejected or normalised field cannot drift out of sync.
 */
export function usePreferences(): PreferencesHandle {
  const [prefs, setPrefs] = useState<Preferences>(defaultPreferences);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void bridge.invoke('prefs:get', {}).then((stored) => {
      setPrefs(stored);
      setLoaded(true);
    });
  }, []);

  const update = useCallback(async (patch: Partial<Preferences>) => {
    // Applied locally first so controls respond immediately, then reconciled
    // with whatever main actually stored.
    setPrefs((current) => ({ ...current, ...patch }));
    setPrefs(await bridge.invoke('prefs:set', patch));
  }, []);

  return { prefs, loaded, update };
}
