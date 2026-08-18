import { describe, expect, it } from 'vitest';
import { defaultPreferences, preferencesSchema } from './preferences.js';

describe('preferences', () => {
  it('produces a complete object from nothing', () => {
    const prefs = defaultPreferences();
    expect(prefs.micMode).toBe('open');
    expect(prefs.identity).toBe('');
    expect(prefs.voiceVolumes).toEqual({});
  });

  it('fills in missing fields rather than rejecting a partial file', () => {
    const parsed = preferencesSchema.parse({ identity: 'trxlezi', micMode: 'push-to-talk' });
    expect(parsed.identity).toBe('trxlezi');
    expect(parsed.micMode).toBe('push-to-talk');
    expect(parsed.pushToTalkKey).toBe('F13');
  });

  it('rejects a volume outside the accepted range', () => {
    expect(() => preferencesSchema.parse({ voiceVolumes: { someone: 3 } })).toThrow();
  });
});
