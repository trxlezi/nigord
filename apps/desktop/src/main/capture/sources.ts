import { desktopCapturer } from 'electron';
import type { CaptureSource } from '@nigord/shared';

/**
 * Screens and windows offered to the picker.
 *
 * Shared by both providers: desktopCapturer is cross-platform, and only what
 * happens to the AUDIO differs between Windows and the stub. Duplicating this
 * would let the two picker experiences drift for no reason.
 */
export async function listDesktopSources(): Promise<CaptureSource[]> {
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
