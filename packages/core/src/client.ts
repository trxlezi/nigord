import type { ContentKind, DisconnectReason } from '@nigord/shared';

/**
 * The port between session logic and the media transport (design.md D1).
 *
 * Session logic depends on this interface, never on LiveKit directly. That is
 * what keeps a move to self-hosted LiveKit — or to another SFU entirely — from
 * touching anything above this line, and what lets the session be tested with
 * a double instead of a media server.
 */

export interface ConnectOptions {
  url: string;
  token: string;
  identity: string;
}

export interface ScreenPublishOptions {
  stream: MediaStream;
  contentKind: ContentKind;
  /** Present only when the platform actually granted system audio. */
  systemAudioTrack: MediaStreamTrack | null;
}

/** Events the transport reports upward. Names mirror the session's vocabulary. */
export interface RoomClientEvents {
  connected: { identity: string };
  disconnected: { reason: DisconnectReason };
  reconnecting: Record<string, never>;
  reconnected: Record<string, never>;
  participantJoined: { identity: string };
  participantLeft: { identity: string };
  muteChanged: { identity: string; isMuted: boolean };
  speakingChanged: { speaking: readonly string[] };
  shareStarted: { identity: string; contentKind: ContentKind; hasSystemAudio: boolean };
  shareStopped: { identity: string };
}

export interface RoomClient {
  connect(options: ConnectOptions): Promise<void>;
  disconnect(): Promise<void>;

  publishMicrophone(deviceId: string): Promise<void>;
  unpublishMicrophone(): Promise<void>;
  setMicrophoneEnabled(enabled: boolean): Promise<void>;

  publishScreen(options: ScreenPublishOptions): Promise<void>;
  unpublishScreen(): Promise<void>;

  /** Local playback volume, 0..1, for one remote participant's voice. */
  setVoiceVolume(identity: string, volume: number): void;
  /** Local playback volume, 0..1, for one remote participant's system audio. */
  setSystemAudioVolume(identity: string, volume: number): void;

  setOutputDevice(deviceId: string): Promise<void>;

  on<E extends keyof RoomClientEvents>(
    event: E,
    listener: (payload: RoomClientEvents[E]) => void,
  ): () => void;
}
