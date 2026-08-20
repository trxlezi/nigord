import type { ContentKind, DisconnectReason } from '@nigord/shared';
import type { ConnectionState as LKConnectionState } from 'livekit-client';
import {
  LocalAudioTrack,
  LocalVideoTrack,
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant,
  createLocalAudioTrack,
} from 'livekit-client';
import type {
  ConnectOptions,
  RoomClient,
  RoomClientEvents,
  ScreenPublishOptions,
} from './client.js';
import { PlaybackBus } from './audio/playbackBus.js';
import { cleanSystemAudio } from './audio/systemAudioCleaner.js';
import { Emitter } from './events.js';
import {
  SYSTEM_AUDIO_MAX_BITRATE_BPS,
  VOICE_MAX_BITRATE_BPS,
  type ShareQuality,
  captureConstraintsFor,
  contentHintFor,
  microphoneConstraints,
  shareEncodingFor,
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

/**
 * Chat travels on the room's data channel as a tagged JSON envelope.
 *
 * Tagged because the channel is shared: anything else this app ever sends over
 * it must be distinguishable, and an untagged payload would have to be guessed
 * at. Unknown kinds are ignored rather than rejected, so an older client stays
 * usable when a newer one starts sending something it has never seen.
 */
const CHAT_KIND = 'nigord.chat.v1';

export class LiveKitRoomClient implements RoomClient {
  private readonly emitter = new Emitter<RoomClientEvents>();
  private readonly room: Room;
  private micTrack: LocalAudioTrack | null = null;
  private screenTrack: LocalVideoTrack | null = null;
  private systemAudioTrack: LocalAudioTrack | null = null;
  private readonly shareKinds = new Map<string, ContentKind>();
  /** O que este cliente reproduz, para poder ser subtraído do loopback. */
  private readonly playback = new PlaybackBus();
  private stopCleaning: (() => void) | null = null;

  constructor() {
    this.room = new Room({
      // Sem camadas para escolher, o que sobra do adaptiveStream é o que
      // interessa: pausar o vídeo de quem não está com a aba visível.
      adaptiveStream: true,
      dynacast: true,
      publishDefaults: {
        // A tela publica uma codificação só, escolhida por quem transmite
        // (qualidade-escolhida-por-quem-transmite, D1). Áudio nunca usou
        // simulcast, então isto não tira nada de ninguém.
        simulcast: false,
        audioPreset: { maxBitrate: VOICE_MAX_BITRATE_BPS },
      },
    });
    this.bindRoomEvents();
  }

  async connect({ url, token }: ConnectOptions): Promise<void> {
    await this.room.connect(url, token);
    this.announceExistingParticipants();
  }

  /**
   * ParticipantConnected only fires for people who arrive AFTER us, so anyone
   * already in the room would never appear — the last person to join would see
   * an empty room, and everyone before them would be invisible to them.
   *
   * Their mute state and any share in progress have to be replayed too: those
   * events also happened before we were listening.
   */
  private announceExistingParticipants(): void {
    for (const participant of this.room.remoteParticipants.values()) {
      this.emitter.emit('participantJoined', { identity: participant.identity });

      const publications = [...participant.trackPublications.values()];

      const microphone = publications.find((p) => p.source === Track.Source.Microphone);
      if (microphone) {
        this.emitter.emit('muteChanged', {
          identity: participant.identity,
          isMuted: microphone.isMuted,
        });
      }

      if (publications.some((p) => p.source === Track.Source.ScreenShare)) {
        this.emitter.emit('shareStarted', {
          identity: participant.identity,
          contentKind: this.shareKinds.get(participant.identity) ?? 'motion',
          hasSystemAudio: publications.some((p) => p.source === Track.Source.ScreenShareAudio),
        });
      }
    }
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
    quality,
    systemAudioTrack,
  }: ScreenPublishOptions): Promise<void> {
    const [videoTrack] = stream.getVideoTracks();
    if (!videoTrack) throw new Error('Screen capture produced no video track');

    // The content hint is the difference between readable text and fluid
    // motion. Without it the encoder treats a screen share as a video call.
    videoTrack.contentHint = contentHintFor(contentKind);

    this.screenTrack = new LocalVideoTrack(videoTrack, undefined, false);

    await this.publish(this.screenTrack, {
      source: Track.Source.ScreenShare,
      name: SCREEN_TRACK_NAME,
      // Uma codificação só. Com simulcast, quem decidia o que cada espectador
      // recebia eram o tamanho da janela dele, a estimativa de banda e o
      // dynacast — e o medido foi 960×540 numa captura de 1920×1080, sem que
      // quem transmitia soubesse. A decisão do projeto é que a sala inteira vê
      // o que quem mostra escolheu, mesmo ao custo de travar para quem não
      // aguenta.
      simulcast: false,
      // Sob pressão, perder quadros antes de perder pixels.
      degradationPreference: 'maintain-resolution',
      // screenShareEncoding, e não videoEncoding: para uma track de tela o SDK
      // lê este campo e ignora o outro.
      screenShareEncoding: shareEncodingFor(quality),
    });

    this.reportScreenEncodings();

    if (systemAudioTrack) {
      // O loopback captura a mistura inteira da saída de áudio — inclusive as
      // vozes que este aplicativo está reproduzindo. Sem isto, cada
      // participante escuta a si mesmo de volta.
      // Qualquer falha aqui degrada para publicar o áudio como veio. O eco
      // incomoda; um compartilhamento que não acontece por causa do tratamento
      // do áudio é muito pior (design D4).
      let limpeza: Awaited<ReturnType<typeof cleanSystemAudio>>;
      try {
        limpeza = await cleanSystemAudio(this.playback, systemAudioTrack);
      } catch (erro) {
        console.warn('nigord: subtração de eco falhou, publicando o áudio como veio —', erro);
        limpeza = { track: systemAudioTrack, delayMs: null, reason: 'erro', stop: () => undefined };
      }
      this.stopCleaning = limpeza.stop;
      // Diagnóstico: as duas faixas lado a lado, para que uma medição externa
      // possa comparar o que foi capturado com o que está sendo publicado. Foi
      // assim que este defeito acabou sendo entendido.
      (globalThis as unknown as { __nigordEco?: unknown }).__nigordEco = () => ({
        atrasoMs: limpeza.delayMs,
        motivo: limpeza.reason,
        bruta: new MediaStream([systemAudioTrack]),
        limpa: new MediaStream([limpeza.track]),
      });
      if (limpeza.reason) {
        console.warn('nigord: áudio do sistema publicado sem subtração —', limpeza.reason);
      }

      // Published as its own track so viewers can lower the game without
      // lowering the voice (design.md D3).
      this.systemAudioTrack = new LocalAudioTrack(limpeza.track, undefined, false);
      await this.publish(this.systemAudioTrack, {
        source: Track.Source.ScreenShareAudio,
        name: SYSTEM_AUDIO_TRACK_NAME,
        audioPreset: { maxBitrate: SYSTEM_AUDIO_MAX_BITRATE_BPS },
        dtx: false,
        red: false,
      });
    }
  }

  /**
   * Muda a qualidade sem interromper a transmissão (design D4).
   *
   * Republicar a track faria a tela piscar para todos os espectadores, e o caso
   * de uso é justamente reagir a uma sala engasgando — o pior momento possível
   * para derrubar a imagem. A resolução e a taxa de quadros vão para a track
   * viva; o teto de bitrate vai para o emissor.
   *
   * Uma restrição recusada pela plataforma deixa a transmissão como estava:
   * "não mudou" é um resultado melhor do que "parou".
   */
  async setScreenQuality(quality: ShareQuality): Promise<void> {
    const track = this.screenTrack;
    if (!track) return;

    try {
      await track.mediaStreamTrack.applyConstraints(captureConstraintsFor(quality));
    } catch {
      // A captura recusou o novo tamanho; o bitrate abaixo ainda vale a pena.
    }

    const sender = track.sender;
    if (!sender) return;
    const parameters = sender.getParameters();
    const [encoding] = parameters.encodings ?? [];
    if (!encoding) return;

    const { maxBitrate, maxFramerate } = shareEncodingFor(quality);
    encoding.maxBitrate = maxBitrate;
    encoding.maxFramerate = maxFramerate;
    try {
      await sender.setParameters(parameters);
    } catch {
      // Idem: manter o que já estava no ar.
    }
    this.reportScreenEncodings();
  }

  /**
   * Logs the encodings the browser actually negotiated for the screen share.
   *
   * What is asked for and what is sent are different things, and the gap is
   * invisible without this: a 1920×1080 capture was delivered at 960×540 for a
   * whole release, and nothing in the app could have shown why.
   */
  private reportScreenEncodings(): void {
    const sender = this.screenTrack?.sender;
    if (!sender) return;
    const encodings = sender.getParameters().encodings ?? [];
    const summary = encodings.map((e) => ({
      rid: e.rid,
      ativa: e.active,
      escala: e.scaleResolutionDownBy,
      bitrate: e.maxBitrate,
      fps: e.maxFramerate,
    }));
    console.info('nigord: camadas publicadas', JSON.stringify(summary));
    // Também num global, porque o diagnóstico útil é o que um roteiro consegue
    // ler sem depender de capturar console.
    (globalThis as unknown as { __nigordEncodings?: unknown }).__nigordEncodings = summary;
    (globalThis as unknown as { __nigordCapture?: unknown }).__nigordCapture =
      this.screenTrack?.mediaStreamTrack.getSettings();
  }

  async sendChat(text: string): Promise<void> {
    const payload = JSON.stringify({ kind: CHAT_KIND, text });
    await this.room.localParticipant.publishData(new TextEncoder().encode(payload), {
      reliable: true,
    });
  }

  async unpublishScreen(): Promise<void> {
    this.stopCleaning?.();
    this.stopCleaning = null;
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

  /**
   * Remote audio is silent until something attaches it (specs/voice-session,
   * "Reprodução da voz recebida").
   *
   * livekit-client subscribes the track and hands it over; it never plays it.
   * attach() creates the element, sets srcObject and calls play(). React never
   * sees these elements — their lifetime is the track's, not a component's
   * (design D1).
   *
   * They are put inside a container in the document rather than left floating:
   * a detached element plays, but nothing outside this file can observe that it
   * is playing, and "o áudio saiu?" is exactly the question that went
   * unanswered through a whole real session. The container makes the answer
   * inspectable (specs/voice-session, "Saída de áudio verificável").
   *
   * This is also what makes setVolume meaningful: it acts on the attached
   * elements, so without this call every volume control was inert.
   */
  private playRemoteAudio(chave: string, track: { mediaStreamTrack: MediaStreamTrack }): void {
    this.playback.play(chave, track.mediaStreamTrack);
    // Diagnóstico legível de fora, para que um roteiro possa afirmar que há som
    // saindo em vez de contar elementos que não existem mais.
    (globalThis as unknown as { __nigordAudio?: unknown }).__nigordAudio = () =>
      this.playback.snapshot();
  }

  /**
   * Whether the platform is currently letting audio play at all.
   *
   * Browsers refuse playback that no gesture authorised, and a refusal is
   * indistinguishable from a broken app: everything looks connected and nothing
   * is heard. The session surfaces this so the participant can act on it.
   */
  canPlayAudio(): boolean {
    // Duas condições, porque há dois jeitos de o sistema recusar: o SDK tem a
    // sua, e o contexto de áudio — que agora é quem toca — tem a dele.
    return this.room.canPlaybackAudio && this.playback.running;
  }

  /** Asks the platform to start playback, after a participant's gesture. */
  async startAudioPlayback(): Promise<void> {
    await this.room.startAudio();
    // O contexto de áudio começa suspenso pelo mesmo motivo que os elementos se
    // recusam a tocar, e o participante já está autorizando exatamente isso.
    await this.playback.resume();
  }

  setVoiceVolume(identity: string, volume: number): void {
    this.playback.setVolume(chaveDeAudio(identity, Track.Source.Microphone), volume);
  }

  setSystemAudioVolume(identity: string, volume: number): void {
    this.playback.setVolume(chaveDeAudio(identity, Track.Source.ScreenShareAudio), volume);
  }

  async setOutputDevice(deviceId: string): Promise<void> {
    await this.room.switchActiveDevice('audiooutput', deviceId);
  }

  screenStreamFor(identity: string): MediaStream | null {
    const participant = this.room.remoteParticipants.get(identity);
    if (!participant) return null;
    for (const publication of participant.trackPublications.values()) {
      if (publication.source !== Track.Source.ScreenShare) continue;
      const track = publication.track;
      // mediaStream is undefined until the subscription completes, which is
      // exactly the window shareStreamReady closes.
      return track?.mediaStream ?? null;
    }
    return null;
  }

  localScreenStream(): MediaStream | null {
    const track = this.screenTrack?.mediaStreamTrack;
    // Built fresh rather than cached: the track is replaced on every share, and
    // a stale stream would show the previous one.
    return track ? new MediaStream([track]) : null;
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
        // Sair da sala não emite TrackUnsubscribed por faixa, então sem isto a
        // reprodução da sessão anterior sobrevive à saída.
        this.playback.stopAll();
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
      .on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (track.kind === Track.Kind.Audio) {
          this.playRemoteAudio(chaveDeAudio(participant.identity, publication.source), track);
        }
        if (publication.source !== Track.Source.ScreenShare) return;
        this.emitter.emit('shareStreamReady', { identity: participant.identity });
      })
      .on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
        if (track.kind !== Track.Kind.Audio) return;
        this.playback.stop(chaveDeAudio(participant.identity, publication.source));
      })
      .on(RoomEvent.AudioPlaybackStatusChanged, () => {
        this.emitter.emit('audioPlaybackChanged', { allowed: this.room.canPlaybackAudio });
      })
      .on(RoomEvent.TrackUnpublished, (publication, participant) => {
        if (publication.source !== Track.Source.ScreenShare) return;
        this.emitter.emit('shareStopped', { identity: participant.identity });
      })
      .on(RoomEvent.DataReceived, (payload: Uint8Array, participant?: RemoteParticipant) => {
        // A packet with no participant came from the server, not a person, and
        // there is nobody to attribute it to.
        if (!participant) return;
        const text = decodeChat(payload);
        if (text === null) return;
        this.emitter.emit('chatReceived', { identity: participant.identity, text });
      });
  }

  get connectionState(): LKConnectionState {
    return this.room.state;
  }
}

/**
 * Reads a chat line out of a data packet, or null when it is not one.
 *
 * Everything here is remote input, so every step is allowed to fail: the
 * packet may not be UTF-8, may not be JSON, may be JSON of another shape, or
 * may be another kind entirely. None of those is exceptional enough to
 * interrupt a session over.
 */
function decodeChat(payload: Uint8Array): string | null {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(payload));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const envelope = parsed as { kind?: unknown; text?: unknown };
    if (envelope.kind !== CHAT_KIND) return null;
    return typeof envelope.text === 'string' ? envelope.text : null;
  } catch {
    return null;
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

/**
 * Identifica uma faixa de áudio remota na reprodução.
 *
 * Identidade e fonte juntas, porque a mesma pessoa publica voz e áudio do
 * sistema — e os volumes das duas são controlados em separado.
 */
function chaveDeAudio(identity: string, source: Track.Source): string {
  return `${identity}::${source}`;
}
