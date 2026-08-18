import { beforeEach, describe, expect, it } from 'vitest';
import { CHAT_MAX_LENGTH } from '@nigord/shared';
import { Session } from './session.js';
import { FakeRoomClient } from './testing.js';

const credentials = { url: 'wss://example', token: 'jwt', identity: 'trxlezi' };

let client: FakeRoomClient;
let session: Session;

beforeEach(() => {
  client = new FakeRoomClient();
  session = new Session({ client });
});

describe('joining and leaving', () => {
  it('publishes the microphone on join', async () => {
    // specs/voice-session: "Entrada bem-sucedida"
    await session.join(credentials);
    expect(session.view.connection).toBe('connected');
    expect(client.calls).toContain('publishMicrophone');
    expect(client.micEnabled).toBe(true);
  });

  it('lists the local participant after joining an empty room', async () => {
    // specs/voice-session: "Sala vazia"
    await session.join(credentials);
    expect(session.view.participants).toHaveLength(1);
    expect(session.view.participants[0]?.isLocal).toBe(true);
  });

  it('ends the session and surfaces the error when the token is rejected', async () => {
    // specs/voice-session: "Token inválido ou expirado"
    client.connectShouldFail = true;
    const errors: string[] = [];
    session.on('error', ({ message }) => errors.push(message));

    await expect(session.join(credentials)).rejects.toThrow('token rejected');
    expect(session.view.connection).toBe('disconnected');
    expect(session.view.reason).toBe('token_rejected');
    expect(errors).toHaveLength(1);
  });

  it('joins without a microphone so the participant can still listen', async () => {
    // A machine with no capture device must not be locked out of the room:
    // hearing the others and watching a share is most of the value.
    client.micShouldFail = true;
    const errors: string[] = [];
    session.on('error', ({ message }) => errors.push(message));

    await session.join(credentials);

    expect(session.view.connection).toBe('connected');
    expect(session.view.hasMicrophone).toBe(false);
    expect(session.view.transmitting).toBe(false);
    // Reported, not hidden — the participant has to know why nobody hears them.
    expect(errors).toEqual(['Requested device not found']);
  });

  it('shows a participant with no microphone as muted to the room', async () => {
    client.micShouldFail = true;
    await session.join(credentials);
    expect(session.view.participants[0]?.isMuted).toBe(true);
  });

  it('never opens the gate without a microphone, whatever the mode', async () => {
    client.micShouldFail = true;
    await session.join(credentials);

    await session.setMicMode('open');
    expect(session.view.transmitting).toBe(false);

    await session.setMicMode('push-to-talk');
    await session.setPushToTalkHeld(true);
    expect(session.view.transmitting).toBe(false);
  });

  it('picks up a microphone plugged in after joining without one', async () => {
    client.micShouldFail = true;
    await session.join(credentials);
    expect(session.view.hasMicrophone).toBe(false);

    // Same device id as before: re-selecting is how recovery is triggered.
    client.micShouldFail = false;
    await session.setInputDevice('default');

    expect(session.view.hasMicrophone).toBe(true);
    expect(session.view.transmitting).toBe(true);
  });

  it('ignores a second join while already connected', async () => {
    await session.join(credentials);
    await session.join(credentials);
    expect(client.calls.filter((c) => c === 'connect')).toHaveLength(1);
  });

  it('disconnects the transport on leave', async () => {
    // specs/voice-session: "Saída explícita"
    await session.join(credentials);
    await session.leave();
    expect(client.calls).toContain('disconnect');
    expect(session.view.connection).toBe('disconnected');
    expect(session.view.reason).toBe('user_left');
  });
});

describe('chat', () => {
  beforeEach(async () => {
    await session.join(credentials);
  });

  it('records your own line, which the transport never echoes back', async () => {
    await session.sendChat('vamos nessa');

    expect(client.sentChat).toEqual(['vamos nessa']);
    expect(session.view.chat).toHaveLength(1);
    expect(session.view.chat[0]?.identity).toBe('trxlezi');
    expect(session.view.chat[0]?.text).toBe('vamos nessa');
  });

  it('appends what other people send, oldest first', () => {
    client.receiveChat('amigo', 'oi');
    client.receiveChat('outro', 'e aí');

    expect(session.view.chat.map((m) => m.text)).toEqual(['oi', 'e aí']);
  });

  it('refuses to send an empty line and leaves the draft alone', async () => {
    expect(await session.sendChat('   ')).toBe(false);
    expect(client.sentChat).toEqual([]);
    expect(session.view.chat).toHaveLength(0);
  });

  it('drops an empty line arriving from a peer', () => {
    // A peer's own UI cannot be relied on to have refused it.
    client.receiveChat('amigo', '   ');
    expect(session.view.chat).toHaveLength(0);
  });

  it('truncates an oversized line, sent or received', async () => {
    await session.sendChat('a'.repeat(900));
    client.receiveChat('amigo', 'b'.repeat(900));

    expect(client.sentChat[0]).toHaveLength(CHAT_MAX_LENGTH);
    expect(session.view.chat[1]?.text).toHaveLength(CHAT_MAX_LENGTH);
  });

  it('keeps the tail bounded so an all-evening session cannot grow forever', () => {
    for (let i = 0; i < 260; i += 1) client.receiveChat('amigo', `linha ${i}`);

    expect(session.view.chat).toHaveLength(200);
    expect(session.view.chat[199]?.text).toBe('linha 259');
  });

  it('gives every line a distinct id, even with identical text', () => {
    client.receiveChat('amigo', 'oi');
    client.receiveChat('amigo', 'oi');

    const [first, second] = session.view.chat;
    expect(first?.id).not.toBe(second?.id);
  });

  it('takes the chat with it on leave, because there is no history', async () => {
    client.receiveChat('amigo', 'oi');
    await session.leave();
    expect(session.view.chat).toHaveLength(0);
  });

  it('drops the chat when the connection dies, not only on a clean leave', () => {
    // Otherwise a drop in one room carried its messages into the next one,
    // attributed to people who were not there.
    client.receiveChat('amigo', 'segredo');
    client.emit('disconnected', { reason: 'connection_lost' });

    expect(session.view.chat).toHaveLength(0);
  });

  it('sends nothing when the session is not live', async () => {
    await session.leave();
    expect(await session.sendChat('oi')).toBe(false);
    expect(client.sentChat).toEqual([]);
  });
});

describe('watching your own share', () => {
  it('resolves the local identity to the locally published screen', async () => {
    // The transport never subscribes anyone to their own tracks, so without
    // this the sharer waits forever on "Recebendo a transmissão…".
    await session.join(credentials);
    const preview = {} as MediaStream;
    client.localScreen = preview;
    await session.startSharing({
      stream: {} as MediaStream,
      contentKind: 'motion',
      systemAudioTrack: null,
    });

    expect(session.screenStreamFor('trxlezi')).toBe(preview);
  });

  it('still resolves other participants through the transport', async () => {
    await session.join(credentials);
    const remote = {} as MediaStream;
    client.screenStreams.set('amigo', remote);

    expect(session.screenStreamFor('amigo')).toBe(remote);
  });

  it('has no preview when not sharing', async () => {
    await session.join(credentials);
    expect(session.screenStreamFor('trxlezi')).toBeNull();
  });
});

describe('microphone gating', () => {
  beforeEach(async () => {
    await session.join(credentials);
  });

  it('stops transmitting when muted', async () => {
    // specs/voice-session: "Silenciar o microfone"
    await session.toggleMute();
    expect(client.micEnabled).toBe(false);
    expect(session.view.micMode).toBe('muted');
    expect(session.view.transmitting).toBe(false);
  });

  it('resumes transmitting when unmuted', async () => {
    await session.toggleMute();
    await session.toggleMute();
    expect(client.micEnabled).toBe(true);
    expect(session.view.micMode).toBe('open');
  });

  it('stays silent in push-to-talk until the key is held', async () => {
    // specs/voice-session: "Transmitir enquanto a tecla está pressionada"
    await session.setMicMode('push-to-talk');
    expect(client.micEnabled).toBe(false);

    await session.setPushToTalkHeld(true);
    expect(client.micEnabled).toBe(true);
    expect(session.view.transmitting).toBe(true);

    await session.setPushToTalkHeld(false);
    expect(client.micEnabled).toBe(false);
  });

  it('does not transmit on a held key outside push-to-talk mode', async () => {
    await session.toggleMute();
    await session.setPushToTalkHeld(true);
    expect(client.micEnabled).toBe(false);
  });

  it('does not strand a held key as an open mic when leaving push-to-talk', async () => {
    await session.setMicMode('push-to-talk');
    await session.setPushToTalkHeld(true);
    await session.setMicMode('muted');
    expect(client.micEnabled).toBe(false);

    await session.setPushToTalkHeld(false);
    expect(client.micEnabled).toBe(false);
  });

  it('republishes without leaving the room when the input device changes', async () => {
    // specs/desktop-shell: "Trocar de dispositivo durante a sessão"
    await session.setInputDevice('headset-mic');
    expect(client.micDeviceId).toBe('headset-mic');
    expect(client.calls).toContain('unpublishMicrophone');
    expect(client.calls).not.toContain('disconnect');
    expect(session.view.connection).toBe('connected');
  });
});

describe('local mute state', () => {
  beforeEach(async () => {
    await session.join(credentials);
  });

  const local = (): { isMuted: boolean } | undefined =>
    session.view.participants.find((participant) => participant.isLocal);

  it('reflects mute and unmute without waiting for the transport to echo', async () => {
    // The transport emits nothing when a freshly published track is unmuted,
    // which used to leave the roster showing a muted participant who was in
    // fact speaking.
    await session.setMicMode('muted');
    expect(local()?.isMuted).toBe(true);

    await session.setMicMode('open');
    expect(local()?.isMuted).toBe(false);
  });

  it('shows push-to-talk as muted until the key is held', async () => {
    await session.setMicMode('push-to-talk');
    expect(local()?.isMuted).toBe(true);

    await session.setPushToTalkHeld(true);
    expect(local()?.isMuted).toBe(false);

    await session.setPushToTalkHeld(false);
    expect(local()?.isMuted).toBe(true);
  });

  it('does not republish the microphone when the device has not changed', async () => {
    // Re-applying stored preferences must be free: republishing drops audio
    // and makes the transport skip mute events.
    const before = client.calls.filter((call) => call === 'publishMicrophone').length;
    await session.setInputDevice(client.micDeviceId ?? 'default');
    const after = client.calls.filter((call) => call === 'publishMicrophone').length;

    expect(after).toBe(before);
  });

  it('republishes when the device really changes', async () => {
    await session.setInputDevice('outro-microfone');
    expect(client.calls).toContain('unpublishMicrophone');
    expect(client.micDeviceId).toBe('outro-microfone');
  });
});

describe('reconnection', () => {
  it('reports reconnecting without ending the session', async () => {
    // specs/voice-session: "Queda temporária de rede"
    await session.join(credentials);
    client.emit('reconnecting', {});
    expect(session.view.connection).toBe('reconnecting');
  });

  it('restores the mute state after reconnecting', async () => {
    // The transport republishes tracks; the gate is the session's job.
    await session.join(credentials);
    await session.toggleMute();

    client.emit('reconnecting', {});
    client.emit('reconnected', {});
    await Promise.resolve();

    expect(session.view.connection).toBe('connected');
    expect(client.micEnabled).toBe(false);
  });

  it('clears the roster when the connection is lost for good', async () => {
    // specs/voice-session: "Falha persistente"
    await session.join(credentials);
    client.join('pedro');
    expect(session.view.participants).toHaveLength(2);

    client.drop();
    expect(session.view.connection).toBe('disconnected');
    expect(session.view.participants).toHaveLength(0);
  });
});

describe('presence', () => {
  beforeEach(async () => {
    await session.join(credentials);
  });

  it('adds and removes remote participants', async () => {
    client.join('pedro');
    expect(session.view.participants.map((p) => p.identity)).toEqual(['trxlezi', 'pedro']);

    client.emit('participantLeft', { identity: 'pedro' });
    expect(session.view.participants.map((p) => p.identity)).toEqual(['trxlezi']);
  });

  it('notifies subscribers when the roster changes', async () => {
    let notifications = 0;
    session.on('changed', () => {
      notifications += 1;
    });
    client.join('pedro');
    expect(notifications).toBeGreaterThan(0);
  });

  it('does not notify when the speaking set is unchanged', async () => {
    client.join('pedro');
    client.emit('speakingChanged', { speaking: ['pedro'] });

    let notifications = 0;
    session.on('changed', () => {
      notifications += 1;
    });
    client.emit('speakingChanged', { speaking: ['pedro'] });
    expect(notifications).toBe(0);
  });
});

describe('screen sharing', () => {
  beforeEach(async () => {
    await session.join(credentials);
  });

  const publishOptions = {
    stream: {} as MediaStream,
    contentKind: 'motion' as const,
    systemAudioTrack: {} as MediaStreamTrack,
  };

  it('publishes a screen with its system audio track', async () => {
    // specs/screen-sharing: "Compartilhar com áudio do sistema"
    await session.startSharing(publishOptions);
    expect(session.view.isSharing).toBe(true);
    expect(client.screen?.systemAudioTrack).not.toBeNull();
  });

  it('publishes without system audio when it was not granted', async () => {
    // specs/screen-sharing: "Compartilhar sem áudio do sistema"
    await session.startSharing({ ...publishOptions, systemAudioTrack: null });
    expect(client.screen?.systemAudioTrack).toBeNull();
  });

  it('keeps voice published when sharing stops', async () => {
    // specs/screen-sharing: "Encerramento explícito"
    await session.startSharing(publishOptions);
    await session.stopSharing();

    expect(session.view.isSharing).toBe(false);
    expect(client.calls).toContain('unpublishScreen');
    expect(client.calls).not.toContain('unpublishMicrophone');
    expect(session.view.connection).toBe('connected');
  });

  it('marks the sharer in the roster without offering the share back', async () => {
    // The transport tells the OTHER participants about a share, so the sharer
    // would otherwise be the only one who cannot see that they are sharing.
    await session.startSharing(publishOptions);

    const local = session.view.participants.find((participant) => participant.isLocal);
    expect(local?.isSharing).toBe(true);
    // Watching your own screen is a mirror, and the stream is not subscribable
    // locally anyway.
    expect(session.view.shares).toHaveLength(0);

    await session.stopSharing();
    expect(session.view.participants.find((p) => p.isLocal)?.isSharing).toBe(false);
  });

  it('does not publish a screen while disconnected', async () => {
    await session.leave();
    await session.startSharing(publishOptions);
    expect(client.calls).not.toContain('publishScreen');
  });

  it('tracks simultaneous remote shares', async () => {
    // specs/screen-sharing: "Compartilhamentos simultâneos"
    client.join('pedro');
    client.join('ana');
    client.startShare('pedro', 'motion', true);
    client.startShare('ana', 'detail', false);

    expect(session.view.shares).toHaveLength(2);
  });

  it('exposes a remote screen stream only once it is subscribed', async () => {
    // specs/screen-sharing: a share is announced when published, but there is
    // nothing to play until the subscription lands.
    client.join('pedro');
    client.startShare('pedro', 'motion', false);
    expect(session.screenStreamFor('pedro')).toBeNull();

    const before = session.view.streamRevision;
    const stream = {} as MediaStream;
    client.readyShare('pedro', stream);

    expect(session.screenStreamFor('pedro')).toBe(stream);
    // The revision is what tells a renderer to re-read the stream.
    expect(session.view.streamRevision).toBeGreaterThan(before);
  });
});

describe('local playback volumes', () => {
  beforeEach(async () => {
    await session.join(credentials);
    client.join('pedro');
  });

  it('sets system audio volume independently of voice', async () => {
    // specs/screen-sharing: "Reduzir o áudio do jogo mantendo a voz"
    session.setSystemAudioVolume('pedro', 0.2);
    expect(client.systemAudioVolumes.get('pedro')).toBe(0.2);
    expect(client.voiceVolumes.get('pedro')).toBeUndefined();
  });

  it('silences one participant locally', async () => {
    // specs/screen-sharing: "Silenciar um participante localmente"
    session.setVoiceVolume('pedro', 0);
    expect(client.voiceVolumes.get('pedro')).toBe(0);
  });

  it('clamps out-of-range volumes instead of passing them through', async () => {
    session.setVoiceVolume('pedro', 4);
    session.setSystemAudioVolume('pedro', -1);
    expect(client.voiceVolumes.get('pedro')).toBe(1);
    expect(client.systemAudioVolumes.get('pedro')).toBe(0);
  });
});
