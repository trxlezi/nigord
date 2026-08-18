import { describe, expect, it, vi } from 'vitest';

// windows.ts reaches electron only through the shared source listing, which
// these tests never exercise — but the import graph still loads it.
vi.mock('electron', () => ({ desktopCapturer: { getSources: async () => [] } }));

const { WindowsCaptureProvider } = await import('./windows.js');

describe('WindowsCaptureProvider', () => {
  it('reports system audio as available', () => {
    // Task 5.3: the whole point of the Windows provider over the stub.
    const provider = new WindowsCaptureProvider();
    expect(provider.capabilities().systemAudio.available).toBe(true);
    expect(provider.capabilities().systemAudio.reason).toBeNull();
  });

  it('asks Electron for loopback only when the share requested it', async () => {
    const provider = new WindowsCaptureProvider();

    await provider.beginCapture({ sourceId: 'screen:0', includeSystemAudio: true });
    expect(provider.pendingAuthorisation()).toEqual({
      sourceId: 'screen:0',
      loopbackAudio: true,
    });

    await provider.beginCapture({ sourceId: 'screen:0', includeSystemAudio: false });
    expect(provider.pendingAuthorisation()?.loopbackAudio).toBe(false);
  });

  it('authorises the source the share asked for', async () => {
    const provider = new WindowsCaptureProvider();
    const granted = await provider.beginCapture({
      sourceId: 'window:42',
      includeSystemAudio: false,
    });
    expect(granted.sourceId).toBe('window:42');
    expect(provider.pendingAuthorisation()?.sourceId).toBe('window:42');
  });

  it('clears the authorisation so a stale one cannot answer a later request', () => {
    const provider = new WindowsCaptureProvider();
    void provider.beginCapture({ sourceId: 'screen:0', includeSystemAudio: true });
    provider.endCapture();
    expect(provider.pendingAuthorisation()).toBeNull();
  });
});
