import type { CaptureCapabilities, CaptureSource } from '@nigord/shared';
import type { CaptureProvider } from './types.js';
import { listDesktopSources } from './sources.js';

/**
 * Windows capture, including system audio (task 5.3).
 *
 * The loopback itself is Electron's: answering a getDisplayMedia request with
 * `audio: 'loopback'` makes Chromium open a WASAPI loopback stream on the
 * default render endpoint and hand it back as an audio track. That answer is
 * given in main/index.ts; what belongs here is the decision to ask for it,
 * because only this provider knows the platform can deliver it.
 *
 * What the loopback captures is the whole default output device, not one
 * process — the game, the browser, notifications, everything audible. That is
 * the intended behaviour for this project (design.md D3: the point is that a
 * friend hears the game), but it is also why the participant chooses per share
 * rather than having it always on.
 */
export class WindowsCaptureProvider implements CaptureProvider {
  private pending: { sourceId: string; loopbackAudio: boolean } | null = null;

  capabilities(): CaptureCapabilities {
    return {
      screenCapture: { available: true, reason: null },
      systemAudio: { available: true, reason: null },
      // Reported by the HotkeyProvider, which is the half that implements it.
      // Kept here only to satisfy the shared schema; main overrides it.
      globalHotkeys: { available: false, reason: null },
    };
  }

  listSources(): Promise<CaptureSource[]> {
    return listDesktopSources();
  }

  async beginCapture(request: {
    sourceId: string;
    includeSystemAudio: boolean;
  }): Promise<{ sourceId: string; systemAudioGranted: boolean }> {
    this.pending = { sourceId: request.sourceId, loopbackAudio: request.includeSystemAudio };

    // Deliberately reports what was REQUESTED, not what arrived: whether a
    // loopback track actually materialises — the default output device could
    // be absent or silent — is only known once the renderer's getDisplayMedia
    // resolves, and the renderer reads that off the stream itself. Claiming
    // success here would be a guess dressed as a fact, and the roster already
    // shows the truth as "tela + som" or "tela".
    return { sourceId: request.sourceId, systemAudioGranted: request.includeSystemAudio };
  }

  pendingAuthorisation(): { sourceId: string; loopbackAudio: boolean } | null {
    return this.pending;
  }

  endCapture(): void {
    this.pending = null;
  }
}
