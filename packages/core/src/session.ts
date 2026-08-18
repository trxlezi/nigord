import type {
  ConnectionState,
  DisconnectReason,
  MicMode,
  Participant,
  ScreenShare,
} from '@nigord/shared';
import type { RoomClient, RoomClientEvents, ScreenPublishOptions } from './client.js';
import { Emitter } from './events.js';
import { type SessionSnapshot, initialSnapshot, isLive, transition } from './machine.js';
import {
  type RoomModel,
  emptyRoom,
  listParticipants,
  listShares,
  reduceRoom,
} from './participants.js';

export interface SessionView {
  connection: ConnectionState;
  reason: DisconnectReason | null;
  participants: Participant[];
  shares: ScreenShare[];
  micMode: MicMode;
  /** True while the microphone is actually transmitting. */
  transmitting: boolean;
  isSharing: boolean;
}

export interface SessionEvents {
  changed: SessionView;
  error: { message: string };
}

export interface SessionOptions {
  client: RoomClient;
  inputDeviceId?: string;
}

/**
 * Owns the session: drives the state machine, keeps the roster, and decides
 * when the microphone actually transmits.
 *
 * The microphone gate is the subtle part. Three modes collapse into one
 * question — should audio flow right now? — and both mute and push-to-talk
 * answer it, so they cannot contradict each other.
 */
export class Session {
  private readonly emitter = new Emitter<SessionEvents>();
  private readonly client: RoomClient;
  private readonly unsubscribes: Array<() => void> = [];

  private snapshot: SessionSnapshot = initialSnapshot();
  private room: RoomModel = emptyRoom();
  private micMode: MicMode = 'open';
  private pushToTalkHeld = false;
  private sharing = false;
  private inputDeviceId: string;
  private localIdentity = '';

  constructor(options: SessionOptions) {
    this.client = options.client;
    this.inputDeviceId = options.inputDeviceId ?? 'default';
    this.bindClient();
  }

  // ---- lifecycle -----------------------------------------------------------

  async join(options: { url: string; token: string; identity: string }): Promise<void> {
    if (this.snapshot.state !== 'disconnected') return;

    this.localIdentity = options.identity;
    this.apply({ type: 'CONNECT' });

    try {
      await this.client.connect(options);
      await this.client.publishMicrophone(this.inputDeviceId);
      // The gate is applied right after publishing so a session joined while
      // muted, or in push-to-talk, never leaks a moment of open audio.
      await this.applyMicGate();
    } catch (error) {
      this.apply({ type: 'DISCONNECT', reason: 'token_rejected' });
      this.emitter.emit('error', { message: describeError(error) });
      throw error;
    }
  }

  async leave(): Promise<void> {
    if (this.snapshot.state === 'disconnected') return;
    this.sharing = false;
    await this.client.disconnect();
    this.apply({ type: 'DISCONNECT', reason: 'user_left' });
  }

  // ---- microphone ----------------------------------------------------------

  async setMicMode(mode: MicMode): Promise<void> {
    if (this.micMode === mode) return;
    this.micMode = mode;
    // Leaving push-to-talk must not strand a held key as a permanently open mic.
    if (mode !== 'push-to-talk') this.pushToTalkHeld = false;
    await this.applyMicGate();
    this.publishView();
  }

  async setPushToTalkHeld(held: boolean): Promise<void> {
    if (this.pushToTalkHeld === held) return;
    this.pushToTalkHeld = held;
    if (this.micMode !== 'push-to-talk') return;
    await this.applyMicGate();
    this.publishView();
  }

  async toggleMute(): Promise<void> {
    await this.setMicMode(this.micMode === 'muted' ? 'open' : 'muted');
  }

  /** Single source of truth for whether audio flows. */
  private shouldTransmit(): boolean {
    if (!isLive(this.snapshot)) return false;
    switch (this.micMode) {
      case 'open':
        return true;
      case 'muted':
        return false;
      case 'push-to-talk':
        return this.pushToTalkHeld;
    }
  }

  private async applyMicGate(): Promise<void> {
    await this.client.setMicrophoneEnabled(this.shouldTransmit());
  }

  async setInputDevice(deviceId: string): Promise<void> {
    this.inputDeviceId = deviceId;
    // specs/desktop-shell requires switching mid-session without leaving the
    // room, so this republishes rather than reconnecting.
    if (!isLive(this.snapshot)) return;
    await this.client.unpublishMicrophone();
    await this.client.publishMicrophone(deviceId);
    await this.applyMicGate();
  }

  setOutputDevice(deviceId: string): Promise<void> {
    return this.client.setOutputDevice(deviceId);
  }

  // ---- screen share --------------------------------------------------------

  async startSharing(options: ScreenPublishOptions): Promise<void> {
    if (!isLive(this.snapshot)) return;
    await this.client.publishScreen(options);
    this.sharing = true;
    this.publishView();
  }

  async stopSharing(): Promise<void> {
    if (!this.sharing) return;
    await this.client.unpublishScreen();
    this.sharing = false;
    this.publishView();
  }

  // ---- local playback ------------------------------------------------------

  setVoiceVolume(identity: string, volume: number): void {
    this.client.setVoiceVolume(identity, clamp01(volume));
  }

  setSystemAudioVolume(identity: string, volume: number): void {
    this.client.setSystemAudioVolume(identity, clamp01(volume));
  }

  // ---- observation ---------------------------------------------------------

  on<E extends keyof SessionEvents>(
    event: E,
    listener: (payload: SessionEvents[E]) => void,
  ): () => void {
    return this.emitter.on(event, listener);
  }

  get view(): SessionView {
    return {
      connection: this.snapshot.state,
      reason: this.snapshot.reason,
      participants: listParticipants(this.room),
      shares: listShares(this.room),
      micMode: this.micMode,
      transmitting: this.shouldTransmit(),
      isSharing: this.sharing,
    };
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribes) unsubscribe();
    this.unsubscribes.length = 0;
    this.emitter.removeAll();
  }

  // ---- internals -----------------------------------------------------------

  private bindClient(): void {
    const sub = <E extends keyof RoomClientEvents>(
      event: E,
      handler: (payload: RoomClientEvents[E]) => void,
    ): void => {
      this.unsubscribes.push(this.client.on(event, handler));
    };

    sub('connected', ({ identity }) => {
      this.localIdentity = identity;
      this.apply({ type: 'CONNECTED' });
      this.room = reduceRoom(this.room, {
        type: 'PARTICIPANT_JOINED',
        identity,
        isLocal: true,
      });
      this.publishView();
    });

    sub('disconnected', ({ reason }) => {
      this.room = emptyRoom();
      this.sharing = false;
      this.apply({ type: 'DISCONNECT', reason });
    });

    sub('reconnecting', () => this.apply({ type: 'CONNECTION_LOST' }));

    sub('reconnected', () => {
      this.apply({ type: 'RECONNECTED' });
      // The transport republishes tracks on reconnect, but the gate is ours:
      // a mic that was muted before the drop must stay muted after it.
      void this.applyMicGate();
    });

    sub('participantJoined', ({ identity }) => {
      this.room = reduceRoom(this.room, {
        type: 'PARTICIPANT_JOINED',
        identity,
        isLocal: identity === this.localIdentity,
      });
      this.publishView();
    });

    sub('participantLeft', ({ identity }) => {
      this.room = reduceRoom(this.room, { type: 'PARTICIPANT_LEFT', identity });
      this.publishView();
    });

    sub('muteChanged', ({ identity, isMuted }) => {
      this.room = reduceRoom(this.room, { type: 'MUTE_CHANGED', identity, isMuted });
      this.publishView();
    });

    sub('speakingChanged', ({ speaking }) => {
      const next = reduceRoom(this.room, { type: 'SPEAKING_CHANGED', speaking });
      if (next === this.room) return;
      this.room = next;
      this.publishView();
    });

    sub('shareStarted', ({ identity, contentKind, hasSystemAudio }) => {
      this.room = reduceRoom(this.room, {
        type: 'SHARE_STARTED',
        identity,
        contentKind,
        hasSystemAudio,
      });
      this.publishView();
    });

    sub('shareStopped', ({ identity }) => {
      this.room = reduceRoom(this.room, { type: 'SHARE_STOPPED', identity });
      this.publishView();
    });
  }

  private apply(event: Parameters<typeof transition>[1]): void {
    const next = transition(this.snapshot, event);
    if (next === this.snapshot) return;
    this.snapshot = next;
    this.publishView();
  }

  private publishView(): void {
    this.emitter.emit('changed', this.view);
  }
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
