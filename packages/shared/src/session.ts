import { z } from 'zod';

/** Connection lifecycle. See design.md D4 and specs/voice-session. */
export const connectionStateSchema = z.enum([
  'disconnected',
  'connecting',
  'connected',
  'reconnecting',
]);
export type ConnectionState = z.infer<typeof connectionStateSchema>;

/**
 * How the microphone is gated. `open` transmits continuously, `muted` never
 * transmits, `push-to-talk` transmits only while the hotkey is held.
 */
export const micModeSchema = z.enum(['open', 'muted', 'push-to-talk']);
export type MicMode = z.infer<typeof micModeSchema>;

/**
 * What a shared screen contains. This maps to the WebRTC content hint and is
 * the difference between readable text and fluid motion — see design.md.
 */
export const contentKindSchema = z.enum(['motion', 'detail']);
export type ContentKind = z.infer<typeof contentKindSchema>;

/** Why a session ended, so the UI can say something useful. */
export const disconnectReasonSchema = z.enum([
  'user_left',
  'connection_lost',
  'duplicate_identity',
  'token_rejected',
  'server_shutdown',
  'unknown',
]);
export type DisconnectReason = z.infer<typeof disconnectReasonSchema>;

export interface Participant {
  identity: string;
  /** True for the participant running this client. */
  isLocal: boolean;
  /** Mute state as published to the room — visible to everyone. */
  isMuted: boolean;
  /** Transient: whether the participant is speaking right now. */
  isSpeaking: boolean;
  /** True while this participant is publishing a screen share. */
  isSharing: boolean;
}

export interface ScreenShare {
  /** Identity of the participant sharing. */
  identity: string;
  contentKind: ContentKind;
  /** True when a system-audio track accompanies the video. */
  hasSystemAudio: boolean;
}
