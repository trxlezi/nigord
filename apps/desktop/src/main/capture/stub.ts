import { desktopCapturer } from 'electron';
import type { CaptureCapabilities, CaptureSource } from '@nigord/shared';
import type { CaptureProvider } from './types.js';

const PLATFORM_NOTE =
  'System audio capture is only implemented for Windows. This is a development ' +
  'build running on another platform.';

/**
 * Development stub for non-Windows platforms (task 5.4).
 *
 * Screen capture itself works here — desktopCapturer is cross-platform — so
 * the whole application can be exercised on Linux: joining, talking, sharing a
 * screen, the full interface. Only system audio is missing, and it is reported
 * as missing rather than faked.
 *
 * See design.md, "Risks": the stub is deliberately honest so the development
 * machine cannot drift from the Windows target unnoticed.
 */
export class StubCaptureProvider implements CaptureProvider {
  private pending: { sourceId: string; loopbackAudio: boolean } | null = null;

  capabilities(): CaptureCapabilities {
    return {
      screenCapture: { available: true, reason: null },
      systemAudio: { available: false, reason: PLATFORM_NOTE },
      globalHotkeys: {
        available: false,
        reason:
          'Global hotkeys are registered on this platform but cannot be verified ' +
          'against fullscreen games outside Windows.',
      },
    };
  }

  async listSources(): Promise<CaptureSource[]> {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: false,
    });

    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      kind: source.id.startsWith('screen:') ? ('screen' as const) : ('window' as const),
      thumbnail: source.thumbnail.isEmpty() ? null : source.thumbnail.toDataURL(),
    }));
  }

  async beginCapture(request: {
    sourceId: string;
    includeSystemAudio: boolean;
  }): Promise<{ sourceId: string; systemAudioGranted: boolean }> {
    // Never true here, whatever was asked for.
    this.pending = { sourceId: request.sourceId, loopbackAudio: false };
    return { sourceId: request.sourceId, systemAudioGranted: false };
  }

  pendingAuthorisation(): { sourceId: string; loopbackAudio: boolean } | null {
    return this.pending;
  }

  endCapture(): void {
    this.pending = null;
  }
}
