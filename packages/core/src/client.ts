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
  /**
   * A remote screen track finished subscribing and is now playable. The viewer
   * needs this as its own signal: a share is announced when published, but the
   * stream only exists once subscription completes.
   */
  shareStreamReady: { identity: string };
  /** A chat line arrived from someone else in the room. */
  chatReceived: { identity: string; text: string };
}

export interface RoomClient {
  connect(options: ConnectOptions): Promise<void>;
  disconnect(): Promise<void>;

  publishMicrophone(deviceId: string): Promise<void>;
  unpublishMicrophone(): Promise<void>;
  setMicrophoneEnabled(enabled: boolean): Promise<void>;

  publishScreen(options: ScreenPublishOptions): Promise<void>;
  unpublishScreen(): Promise<void>;

  /**
   * Sends a chat line to everyone in the room, reliably.
   *
   * Reliable rather than lossy: a dropped syllable of audio is forgivable
   * because the next one arrives, but a dropped sentence is simply gone and
   * the sender has no way to know.
   */
  sendChat(text: string): Promise<void>;

  /** Local playback volume, 0..1, for one remote participant's voice. */
  setVoiceVolume(identity: string, volume: number): void;
  /** Local playback volume, 0..1, for one remote participant's system audio. */
  setSystemAudioVolume(identity: string, volume: number): void;

  setOutputDevice(deviceId: string): Promise<void>;

  /**
   * The subscribed screen stream for one participant, or null while it is not
   * yet available. Returning the stream rather than attaching to an element
   * keeps DOM ownership in the renderer.
   */
  screenStreamFor(identity: string): MediaStream | null;

  /**
   * The screen this client is publishing, or null when it is not sharing.
   *
   * The transport never subscribes anyone to their own tracks, so the sharer is
   * the one person who cannot see the share through screenStreamFor. It comes
   * straight off the local track instead.
   */
  localScreenStream(): MediaStream | null;

  on<E extends keyof RoomClientEvents>(
    event: E,
    listener: (payload: RoomClientEvents[E]) => void,
  ): () => void;
}
