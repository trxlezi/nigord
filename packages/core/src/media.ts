import type { ContentKind } from '@nigord/shared';

/**
 * Media constraints and encoding policy, kept as plain data so the choices
 * are inspectable and testable without a browser.
 */

/**
 * Voice capture. Echo cancellation and noise suppression are wanted here and
 * only here — see systemAudioConstraints for why.
 */
export const microphoneConstraints = (deviceId: string): MediaTrackConstraints => ({
  ...(deviceId === 'default' ? {} : { deviceId: { exact: deviceId } }),
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
});

/**
 * System audio must bypass every voice filter (design.md D3).
 *
 * Echo cancellation and noise suppression assume the signal is speech and treat
 * music and sound effects as noise to remove. Running game audio through them
 * destroys it. Stereo and the full sample rate are kept for the same reason.
 */
export const systemAudioConstraints = (): MediaTrackConstraints => ({
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 2,
});

/**
 * The content hint tells the encoder what it is looking at. Without it, screen
 * share is encoded as if it were a video call: low framerate, conservative
 * bitrate, blurry under motion.
 *
 * 'motion' trades detail for fluidity (games). 'detail' trades framerate for
 * sharpness (code, text). See specs/screen-sharing.
 */
export const contentHintFor = (kind: ContentKind): 'motion' | 'detail' =>
  kind === 'motion' ? 'motion' : 'detail';

export interface EncodingLayer {
  readonly maxBitrateBps: number;
  readonly maxFramerate: number;
  readonly scaleDownBy: number;
}

/**
 * Simulcast layers for screen share. Publishing several qualities at once is
 * what lets a viewer on a weak connection drop to a lower layer without
 * degrading what everyone else receives (specs/screen-sharing).
 *
 * These are starting values. Task 10.5 calibrates them against a real
 * six-person session.
 */
export function screenShareLayers(kind: ContentKind): EncodingLayer[] {
  return kind === 'motion'
    ? [
        { maxBitrateBps: 5_000_000, maxFramerate: 60, scaleDownBy: 1 },
        { maxBitrateBps: 1_500_000, maxFramerate: 30, scaleDownBy: 2 },
      ]
    : [
        { maxBitrateBps: 3_000_000, maxFramerate: 15, scaleDownBy: 1 },
        { maxBitrateBps: 800_000, maxFramerate: 10, scaleDownBy: 2 },
      ];
}

/** Voice needs very little; the ceiling exists to stop the encoder overreaching. */
export const VOICE_MAX_BITRATE_BPS = 32_000;

/** System audio is music-grade and stereo, so it gets a real budget. */
export const SYSTEM_AUDIO_MAX_BITRATE_BPS = 160_000;
