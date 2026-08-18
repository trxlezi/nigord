import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Preferences, defaultPreferences, preferencesSchema } from '@nigord/shared';

/** Mirrors the shape zod's .partial() produces on the IPC boundary. */
export type PreferencesPatch = { [K in keyof Preferences]?: Preferences[K] | undefined };

/**
 * Local preferences (task 6.7).
 *
 * A missing or corrupted file must never stop the app from starting
 * (specs/desktop-shell), so every read falls back to defaults and every field
 * has one. Written synchronously — it is a few hundred bytes, and losing the
 * last volume change to a crash is worse than the microseconds it costs.
 */
export class PreferencesStore {
  private readonly path: string;
  private cache: Preferences;

  constructor(userDataPath: string) {
    this.path = join(userDataPath, 'preferences.json');
    this.cache = this.read();
  }

  get(): Preferences {
    return this.cache;
  }

  update(patch: PreferencesPatch): Preferences {
    // Undefined entries are dropped rather than merged: an absent key means
    // "leave it alone", but spreading it would blank the value back to its
    // default on the next parse.
    const defined = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    );
    this.cache = preferencesSchema.parse({ ...this.cache, ...defined });
    try {
      writeFileSync(this.path, JSON.stringify(this.cache, null, 2), 'utf8');
    } catch {
      // A failed write costs the participant their settings next launch. It is
      // not worth taking the session down for.
    }
    return this.cache;
  }

  private read(): Preferences {
    try {
      const parsed = preferencesSchema.safeParse(JSON.parse(readFileSync(this.path, 'utf8')));
      return parsed.success ? parsed.data : defaultPreferences();
    } catch {
      return defaultPreferences();
    }
  }
}
