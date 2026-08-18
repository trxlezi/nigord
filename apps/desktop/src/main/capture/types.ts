import type { CaptureCapabilities, CaptureSource } from '@nigord/shared';

/**
 * The platform boundary (design.md D2).
 *
 * Everything the operating system does differently lives behind this
 * interface. There are two implementations: the real one for Windows, and a
 * development stub for Linux. Resolution happens once, at startup, in
 * capture/index.ts — never at the point of use.
 *
 * The stub does not simulate success. When a capability is unavailable it says
 * so with a reason the UI can show, because a stub that pretends to work would
 * let the Linux development machine drift away from the Windows target
 * silently, which is the one failure mode this whole arrangement exists to
 * prevent.
 */
export interface CaptureProvider {
  /** What this platform can actually do, with a reason for anything it cannot. */
  capabilities(): CaptureCapabilities;

  /** Screens and windows available to share, with preview thumbnails. */
  listSources(): Promise<CaptureSource[]>;

  /**
   * Authorises the next getDisplayMedia call in the renderer to use this
   * source, and reports whether system audio was actually obtained.
   *
   * The media stream itself is acquired in the renderer — only the permission
   * decision and the loopback request belong to the main process.
   */
  beginCapture(request: { sourceId: string; includeSystemAudio: boolean }): Promise<{
    sourceId: string;
    systemAudioGranted: boolean;
  }>;

  /** Clears any pending authorisation. Safe to call when nothing is active. */
  endCapture(): void;
}
