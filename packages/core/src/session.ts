import type {
  ChatMessage,
  ConnectionState,
  DisconnectReason,
  MicMode,
  Participant,
  ScreenShare,
} from '@nigord/shared';
import { CHAT_MAX_LENGTH } from '@nigord/shared';
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
  /**
   * False when no microphone could be opened. The session is still live: the
   * participant hears everyone and sees shared screens, they just cannot speak.
   */
  hasMicrophone: boolean;
  isSharing: boolean;
  /** Chat for this session only, oldest first. Never persisted. */
  chat: readonly ChatMessage[];
  /**
   * Bumped whenever a remote screen stream becomes available. The streams
   * themselves are not part of the view — they are mutable media objects, not
   * state — so this is what tells a renderer to re-read them.
   */
  streamRevision: number;
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
  private micAvailable = false;
  private localIdentity = '';
  private streamRevision = 0;
  private chat: ChatMessage[] = [];
  private chatSequence = 0;

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
    } catch (error) {
      // Only the connection is fatal: without it there is no session at all.
      this.apply({ type: 'DISCONNECT', reason: 'token_rejected' });
      this.emitter.emit('error', { message: describeError(error) });
      throw error;
    }

    await this.openMicrophone();
  }

  /**
   * Publishes the microphone, tolerating its absence.
   *
   * A participant with no working microphone can still hear the others and
   * watch a shared screen, and that is most of the value of being in the room.
   * Refusing the join outright would deny them all of it to prevent the one
   * thing already impossible, so the failure is reported and carried as state.
   */
  private async openMicrophone(): Promise<void> {
    try {
      await this.client.publishMicrophone(this.inputDeviceId);
      this.micAvailable = true;
    } catch (error) {
      this.micAvailable = false;
      this.emitter.emit('error', { message: describeError(error) });
    }
    // The gate is applied either way so a session joined while muted, or in
    // push-to-talk, never leaks a moment of open audio — and so someone with
    // no microphone shows up muted to everyone instead of silently open.
    await this.applyMicGate();
    this.publishView();
  }

  async leave(): Promise<void> {
    if (this.snapshot.state === 'disconnected') return;
    this.sharing = false;
    this.micAvailable = false;
    // The chat exists only while the room does, so leaving takes it with it.
    this.chat = [];
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
    if (!this.micAvailable) return false;
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
    const transmitting = this.shouldTransmit();
    if (this.micAvailable) await this.client.setMicrophoneEnabled(transmitting);

    // Our own mute state is decided here, not learned from the transport. A
    // freshly published track is already unmuted, so unmuting it emits nothing
    // and the roster would keep showing "mudo" for someone who is speaking.
    if (this.localIdentity) {
      this.room = reduceRoom(this.room, {
        type: 'MUTE_CHANGED',
        identity: this.localIdentity,
        isMuted: !transmitting,
      });
    }
  }

  async setInputDevice(deviceId: string): Promise<void> {
    // Republishing tears the track down and builds a new one, which drops audio
    // for a moment and — worse — makes the transport skip the mute events the
    // roster depends on. Callers re-apply stored preferences freely, so the
    // no-op has to be caught here rather than at every call site.
    // The exception is a session with no microphone: re-selecting the same
    // device is how someone who plugged one in gets it picked up, so that must
    // not be swallowed as a no-op.
    if (deviceId === this.inputDeviceId && this.micAvailable) return;
    this.inputDeviceId = deviceId;
    // specs/desktop-shell requires switching mid-session without leaving the
    // room, so this republishes rather than reconnecting.
    if (!isLive(this.snapshot)) return;
    if (this.micAvailable) await this.client.unpublishMicrophone();
    await this.openMicrophone();
  }

  setOutputDevice(deviceId: string): Promise<void> {
    return this.client.setOutputDevice(deviceId);
  }

  // ---- chat ----------------------------------------------------------------

  /**
   * Sends a chat line, and records it locally.
   *
   * The transport does not echo a participant's own data back to them, so the
   * sender would otherwise watch their message vanish. Recording it here is
   * also what makes it appear instantly instead of after a round trip.
   *
   * Returns false when there was nothing to send, so the caller can leave the
   * input alone rather than clearing what the participant typed.
   */
  async sendChat(text: string): Promise<boolean> {
    const trimmed = text.trim().slice(0, CHAT_MAX_LENGTH);
    if (trimmed === '' || !isLive(this.snapshot)) return false;

    await this.client.sendChat(trimmed);
    this.recordChat(this.localIdentity, trimmed);
    return true;
  }

  /**
   * Appends a line, keeping the tail bounded.
   *
   * A session left open all evening would otherwise grow without limit, and
   * nobody scrolls back that far in a chat with no history by design.
   */
  private recordChat(identity: string, text: string): void {
    this.chatSequence += 1;
    this.chat = [
      ...this.chat.slice(-(CHAT_HISTORY_LIMIT - 1)),
      { id: `${this.chatSequence}`, identity, text, at: Date.now() },
    ];
    this.publishView();
  }

  // ---- screen share --------------------------------------------------------

  async startSharing(options: ScreenPublishOptions): Promise<void> {
    if (!isLive(this.snapshot)) return;
    await this.client.publishScreen(options);
    this.sharing = true;
    // Marked locally for the same reason as mute: the transport announces a
    // share to the OTHER participants, so waiting for it would leave the sharer
    // as the only person in the room who cannot see that they are sharing.
    this.room = reduceRoom(this.room, {
      type: 'SHARE_STARTED',
      identity: this.localIdentity,
      contentKind: options.contentKind,
      hasSystemAudio: options.systemAudioTrack !== null,
    });
    this.publishView();
  }

  async stopSharing(): Promise<void> {
    if (!this.sharing) return;
    await this.client.unpublishScreen();
    this.sharing = false;
    this.room = reduceRoom(this.room, { type: 'SHARE_STOPPED', identity: this.localIdentity });
    this.publishView();
  }

  // ---- local playback ------------------------------------------------------

  setVoiceVolume(identity: string, volume: number): void {
    this.client.setVoiceVolume(identity, clamp01(volume));
  }

  setSystemAudioVolume(identity: string, volume: number): void {
    this.client.setSystemAudioVolume(identity, clamp01(volume));
  }

  /** The playable screen stream for a participant, if it has arrived. */
  screenStreamFor(identity: string): MediaStream | null {
    // Watching your own share is the only way to confirm what the others are
    // actually receiving — the sharer has no other feedback that frames are
    // leaving the machine.
    if (identity === this.localIdentity) return this.client.localScreenStream();
    return this.client.screenStreamFor(identity);
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
      hasMicrophone: this.micAvailable,
      isSharing: this.sharing,
      chat: this.chat,
      streamRevision: this.streamRevision,
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

    sub('chatReceived', ({ identity, text }) => {
      const trimmed = text.trim().slice(0, CHAT_MAX_LENGTH);
      // Remote input: a peer could send an empty or oversized line whatever
      // its own UI allows, so the same limits are applied on arrival.
      if (trimmed === '') return;
      this.recordChat(identity, trimmed);
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

    sub('shareStreamReady', () => {
      this.streamRevision += 1;
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

/** How many lines a session keeps in memory. */
const CHAT_HISTORY_LIMIT = 200;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
