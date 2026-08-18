import type { ContentKind, DisconnectReason } from '@nigord/shared';
import type { ConnectionState as LKConnectionState } from 'livekit-client';
import {
  LocalAudioTrack,
  LocalVideoTrack,
  Room,
  RoomEvent,
  Track,
  type RemoteAudioTrack,
  type RemoteParticipant,
  type RemoteTrackPublication,
  createLocalAudioTrack,
} from 'livekit-client';
import type {
  ConnectOptions,
  RoomClient,
  RoomClientEvents,
  ScreenPublishOptions,
} from './client.js';
import { Emitter } from './events.js';
import {
  SYSTEM_AUDIO_MAX_BITRATE_BPS,
  VOICE_MAX_BITRATE_BPS,
  contentHintFor,
  microphoneConstraints,
  screenShareLayers,
} from './media.js';

/**
 * The only file in packages/core that knows LiveKit exists (design.md D1).
 *
 * Everything above it depends on the RoomClient port, so replacing the SFU
 * means replacing this file and nothing else.
 */

/**
 * Track names carry the semantics LiveKit itself does not: both the voice and
 * the system-audio tracks are microphone-sourced from its point of view, and
 * viewers must be able to tell them apart to control the volumes separately.
 */
const SYSTEM_AUDIO_TRACK_NAME = 'nigord-system-audio';
const SCREEN_TRACK_NAME = 'nigord-screen';

export class LiveKitRoomClient implements RoomClient {
  private readonly emitter = new Emitter<RoomClientEvents>();
  private readonly room: Room;
  private micTrack: LocalAudioTrack | null = null;
  private screenTrack: LocalVideoTrack | null = null;
  private systemAudioTrack: LocalAudioTrack | null = null;
  private readonly shareKinds = new Map<string, ContentKind>();

  constructor() {
    this.room = new Room({
      adaptiveStream: true,
      // Simulcast is what lets one viewer on a weak connection drop a layer
      // without degrading what the others receive.
      dynacast: true,
      publishDefaults: {
        simulcast: true,
        audioPreset: { maxBitrate: VOICE_MAX_BITRATE_BPS },
      },
    });
    this.bindRoomEvents();
  }

  async connect({ url, token }: ConnectOptions): Promise<void> {
    await this.room.connect(url, token);
  }

  async disconnect(): Promise<void> {
    await this.room.disconnect();
  }

  // ---- microphone ----------------------------------------------------------

  async publishMicrophone(deviceId: string): Promise<void> {
    this.micTrack = await createLocalAudioTrack(microphoneConstraints(deviceId));
    await this.publish(this.micTrack, { source: Track.Source.Microphone });
  }

  async unpublishMicrophone(): Promise<void> {
    if (!this.micTrack) return;
    await this.unpublish(this.micTrack);
    this.micTrack.stop();
    this.micTrack = null;
  }

  async setMicrophoneEnabled(enabled: boolean): Promise<void> {
    if (!this.micTrack) return;
    // mute()/unmute() stops sending while keeping the publication, which is what
    // makes push-to-talk fast enough to feel instant — republishing a track per
    // key press would add hundreds of milliseconds.
    await (enabled ? this.micTrack.unmute() : this.micTrack.mute());
  }

  // ---- screen share --------------------------------------------------------

  async publishScreen({
    stream,
    contentKind,
    systemAudioTrack,
  }: ScreenPublishOptions): Promise<void> {
    const [videoTrack] = stream.getVideoTracks();
    if (!videoTrack) throw new Error('Screen capture produced no video track');

    // The content hint is the difference between readable text and fluid
    // motion. Without it the encoder treats a screen share as a video call.
    videoTrack.contentHint = contentHintFor(contentKind);

    this.screenTrack = new LocalVideoTrack(videoTrack, undefined, false);
    const [topLayer] = screenShareLayers(contentKind);
    await this.publish(this.screenTrack, {
      source: Track.Source.ScreenShare,
      name: SCREEN_TRACK_NAME,
      simulcast: true,
      ...(topLayer
        ? {
            videoEncoding: {
              maxBitrate: topLayer.maxBitrateBps,
              maxFramerate: topLayer.maxFramerate,
            },
          }
        : {}),
    });

    if (systemAudioTrack) {
      // Published as its own track so viewers can lower the game without
      // lowering the voice (design.md D3).
      this.systemAudioTrack = new LocalAudioTrack(systemAudioTrack, undefined, false);
      await this.publish(this.systemAudioTrack, {
        source: Track.Source.ScreenShareAudio,
        name: SYSTEM_AUDIO_TRACK_NAME,
        audioPreset: { maxBitrate: SYSTEM_AUDIO_MAX_BITRATE_BPS },
        dtx: false,
        red: false,
      });
    }
  }

  async unpublishScreen(): Promise<void> {
    for (const track of [this.screenTrack, this.systemAudioTrack]) {
      if (!track) continue;
      await this.unpublish(track);
      track.stop();
    }
    this.screenTrack = null;
    this.systemAudioTrack = null;
  }

  /**
   * publishTrack/unpublishTrack are the one place livekit-client's typings
   * collide with exactOptionalPropertyTypes: LocalTrack declares `processor`
   * as optional, which the signature does not accept. Confining the cast to
   * these two helpers keeps it from spreading through the adapter.
   */
  private publish(
    track: LocalAudioTrack | LocalVideoTrack,
    options: Parameters<Room['localParticipant']['publishTrack']>[1],
  ): Promise<unknown> {
    return this.room.localParticipant.publishTrack(track as never, options);
  }

  private unpublish(track: LocalAudioTrack | LocalVideoTrack): Promise<unknown> {
    return this.room.localParticipant.unpublishTrack(track as never);
  }

  // ---- playback ------------------------------------------------------------

  setVoiceVolume(identity: string, volume: number): void {
    this.forEachAudioTrack(identity, (track, publication) => {
      if (publication.source === Track.Source.Microphone) track.setVolume(volume);
    });
  }

  setSystemAudioVolume(identity: string, volume: number): void {
    this.forEachAudioTrack(identity, (track, publication) => {
      if (publication.source === Track.Source.ScreenShareAudio) track.setVolume(volume);
    });
  }

  private forEachAudioTrack(
    identity: string,
    apply: (track: RemoteAudioTrack, publication: RemoteTrackPublication) => void,
  ): void {
    const participant = this.room.remoteParticipants.get(identity);
    if (!participant) return;
    for (const publication of participant.trackPublications.values()) {
      const track = publication.track;
      if (track && track.kind === Track.Kind.Audio) {
        apply(track as RemoteAudioTrack, publication as RemoteTrackPublication);
      }
    }
  }

  async setOutputDevice(deviceId: string): Promise<void> {
    await this.room.switchActiveDevice('audiooutput', deviceId);
  }

  on<E extends keyof RoomClientEvents>(
    event: E,
    listener: (payload: RoomClientEvents[E]) => void,
  ): () => void {
    return this.emitter.on(event, listener);
  }

  // ---- event translation ---------------------------------------------------

  private bindRoomEvents(): void {
    this.room
      .on(RoomEvent.Connected, () => {
        this.emitter.emit('connected', { identity: this.room.localParticipant.identity });
      })
      .on(RoomEvent.Disconnected, (reason) => {
        this.emitter.emit('disconnected', { reason: translateDisconnect(reason) });
      })
      .on(RoomEvent.Reconnecting, () => this.emitter.emit('reconnecting', {}))
      .on(RoomEvent.Reconnected, () => this.emitter.emit('reconnected', {}))
      .on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
        this.emitter.emit('participantJoined', { identity: participant.identity });
      })
      .on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
        this.shareKinds.delete(participant.identity);
        this.emitter.emit('participantLeft', { identity: participant.identity });
      })
      .on(RoomEvent.TrackMuted, (publication, participant) => {
        if (publication.source === Track.Source.Microphone) {
          this.emitter.emit('muteChanged', { identity: participant.identity, isMuted: true });
        }
      })
      .on(RoomEvent.TrackUnmuted, (publication, participant) => {
        if (publication.source === Track.Source.Microphone) {
          this.emitter.emit('muteChanged', { identity: participant.identity, isMuted: false });
        }
      })
      .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        this.emitter.emit('speakingChanged', { speaking: speakers.map((s) => s.identity) });
      })
      .on(RoomEvent.TrackPublished, (publication, participant) => {
        if (publication.source !== Track.Source.ScreenShare) return;
        // The publisher's content kind is not carried by LiveKit metadata;
        // 'motion' is the safe default until the sharer's own UI reports it.
        const contentKind = this.shareKinds.get(participant.identity) ?? 'motion';
        const hasSystemAudio = [...participant.trackPublications.values()].some(
          (p) => p.source === Track.Source.ScreenShareAudio,
        );
        this.emitter.emit('shareStarted', {
          identity: participant.identity,
          contentKind,
          hasSystemAudio,
        });
      })
      .on(RoomEvent.TrackUnpublished, (publication, participant) => {
        if (publication.source !== Track.Source.ScreenShare) return;
        this.emitter.emit('shareStopped', { identity: participant.identity });
      });
  }

  get connectionState(): LKConnectionState {
    return this.room.state;
  }
}

function translateDisconnect(reason: unknown): DisconnectReason {
  switch (reason) {
    case 1: // CLIENT_INITIATED
      return 'user_left';
    case 2: // DUPLICATE_IDENTITY
      return 'duplicate_identity';
    case 3: // SERVER_SHUTDOWN
      return 'server_shutdown';
    case 5: // ROOM_DELETED
    case 6: // STATE_MISMATCH
      return 'connection_lost';
    default:
      return reason === undefined ? 'user_left' : 'unknown';
  }
}
