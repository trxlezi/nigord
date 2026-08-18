import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PreferencesStore } from './store.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'nigord-prefs-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('PreferencesStore', () => {
  it('starts from defaults when no file exists', () => {
    // specs/desktop-shell: "Preferências corrompidas ou ausentes"
    expect(new PreferencesStore(dir).get().micMode).toBe('open');
  });

  it('falls back to defaults on an unreadable file rather than throwing', () => {
    writeFileSync(join(dir, 'preferences.json'), '{ not json at all', 'utf8');
    expect(() => new PreferencesStore(dir)).not.toThrow();
    expect(new PreferencesStore(dir).get().pushToTalkKey).toBe('F13');
  });

  it('falls back to defaults when the file has the wrong shape', () => {
    writeFileSync(join(dir, 'preferences.json'), JSON.stringify({ micMode: 'shouting' }), 'utf8');
    expect(new PreferencesStore(dir).get().micMode).toBe('open');
  });

  it('persists across instances', () => {
    // specs/desktop-shell: "Reinício do aplicativo"
    new PreferencesStore(dir).update({ identity: 'trxlezi', micMode: 'push-to-talk' });

    const reopened = new PreferencesStore(dir).get();
    expect(reopened.identity).toBe('trxlezi');
    expect(reopened.micMode).toBe('push-to-talk');
  });

  it('leaves untouched fields alone on a partial update', () => {
    const store = new PreferencesStore(dir);
    store.update({ identity: 'trxlezi' });
    store.update({ micMode: 'muted' });
    expect(store.get().identity).toBe('trxlezi');
  });

  it('ignores undefined entries instead of blanking the value', () => {
    const store = new PreferencesStore(dir);
    store.update({ identity: 'trxlezi' });
    store.update({ identity: undefined, micMode: 'muted' });
    expect(store.get().identity).toBe('trxlezi');
  });

  it('rejects a value outside the schema', () => {
    const store = new PreferencesStore(dir);
    expect(() => store.update({ voiceVolumes: { pedro: 9 } })).toThrow();
  });
});
