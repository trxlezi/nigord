import type { ContentKind, DisconnectReason } from '@nigord/shared';
import type {
  ConnectOptions,
  RoomClient,
  RoomClientEvents,
  ScreenPublishOptions,
} from './client.js';
import { Emitter } from './events.js';

/**
 * An in-memory RoomClient for tests (task 4.9).
 *
 * It records what the session asked of the transport and lets a test push
 * transport events back, which is the whole reason the port in client.ts
 * exists — none of this needs a media server or a browser.
 */
export class FakeRoomClient implements RoomClient {
  private readonly emitter = new Emitter<RoomClientEvents>();

  readonly calls: string[] = [];
  micEnabled: boolean | null = null;
  micDeviceId: string | null = null;
  outputDeviceId: string | null = null;
  screen: ScreenPublishOptions | null = null;
  /** Stands in for the local publisher's own video, which has no subscription. */
  localScreen: MediaStream | null = null;
  readonly sentChat: string[] = [];
  readonly voiceVolumes = new Map<string, number>();
  readonly systemAudioVolumes = new Map<string, number>();
  audioPlaybackAllowed = true;
  connectShouldFail = false;
  micShouldFail = false;
  readonly screenStreams = new Map<string, MediaStream>();

  async connect(options: ConnectOptions): Promise<void> {
    this.calls.push('connect');
    if (this.connectShouldFail) throw new Error('token rejected');
    this.emitter.emit('connected', { identity: options.identity });
  }

  async disconnect(): Promise<void> {
    this.calls.push('disconnect');
    this.emitter.emit('disconnected', { reason: 'user_left' });
  }

  async publishMicrophone(deviceId: string): Promise<void> {
    this.calls.push('publishMicrophone');
    if (this.micShouldFail) throw new Error('Requested device not found');
    this.micDeviceId = deviceId;
  }

  async unpublishMicrophone(): Promise<void> {
    this.calls.push('unpublishMicrophone');
    this.micDeviceId = null;
  }

  async setMicrophoneEnabled(enabled: boolean): Promise<void> {
    this.calls.push(`setMicrophoneEnabled:${enabled}`);
    this.micEnabled = enabled;
  }

  async publishScreen(options: ScreenPublishOptions): Promise<void> {
    this.calls.push('publishScreen');
    this.screen = options;
  }

  async unpublishScreen(): Promise<void> {
    this.calls.push('unpublishScreen');
    this.screen = null;
  }

  setVoiceVolume(identity: string, volume: number): void {
    this.voiceVolumes.set(identity, volume);
  }

  setSystemAudioVolume(identity: string, volume: number): void {
    this.systemAudioVolumes.set(identity, volume);
  }

  async setOutputDevice(deviceId: string): Promise<void> {
    this.outputDeviceId = deviceId;
  }

  canPlayAudio(): boolean {
    return this.audioPlaybackAllowed;
  }

  async startAudioPlayback(): Promise<void> {
    this.audioPlaybackAllowed = true;
    this.emitter.emit('audioPlaybackChanged', { allowed: true });
  }

  /** Lets a test put the platform in the state where it refuses to play. */
  blockAudioPlayback(): void {
    this.audioPlaybackAllowed = false;
    this.emitter.emit('audioPlaybackChanged', { allowed: false });
  }

  screenStreamFor(identity: string): MediaStream | null {
    return this.screenStreams.get(identity) ?? null;
  }

  async sendChat(text: string): Promise<void> {
    this.calls.push('sendChat');
    this.sentChat.push(text);
  }

  /** Delivers a line as if it came from someone else in the room. */
  receiveChat(identity: string, text: string): void {
    this.emitter.emit('chatReceived', { identity, text });
  }

  localScreenStream(): MediaStream | null {
    return this.screen ? (this.localScreen ?? null) : null;
  }

  on<E extends keyof RoomClientEvents>(
    event: E,
    listener: (payload: RoomClientEvents[E]) => void,
  ): () => void {
    return this.emitter.on(event, listener);
  }

  // ---- test drivers --------------------------------------------------------

  emit<E extends keyof RoomClientEvents>(event: E, payload: RoomClientEvents[E]): void {
    this.emitter.emit(event, payload);
  }

  join(identity: string): void {
    this.emit('participantJoined', { identity });
  }

  drop(reason: DisconnectReason = 'connection_lost'): void {
    this.emit('disconnected', { reason });
  }

  startShare(identity: string, contentKind: ContentKind, hasSystemAudio: boolean): void {
    this.emit('shareStarted', { identity, contentKind, hasSystemAudio });
  }

  /** Makes a share playable, as the transport does once subscription lands. */
  readyShare(identity: string, stream: MediaStream): void {
    this.screenStreams.set(identity, stream);
    this.emit('shareStreamReady', { identity });
  }
}
