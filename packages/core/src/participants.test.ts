import { describe, expect, it } from 'vitest';
import {
  type RoomEvent,
  type RoomModel,
  emptyRoom,
  listParticipants,
  listShares,
  reduceRoom,
} from './participants.js';

const run = (events: RoomEvent[], from: RoomModel = emptyRoom()): RoomModel =>
  events.reduce(reduceRoom, from);

const joined = (identity: string, isLocal = false): RoomEvent => ({
  type: 'PARTICIPANT_JOINED',
  identity,
  isLocal,
});

describe('room model', () => {
  it('adds participants as they join', () => {
    // specs/voice-session: "Participante entra na sala"
    const room = run([joined('trxlezi', true), joined('pedro')]);
    expect(listParticipants(room)).toHaveLength(2);
  });

  it('lists the local participant first, then alphabetically', () => {
    const room = run([joined('ana'), joined('trxlezi', true), joined('bruno')]);
    expect(listParticipants(room).map((p) => p.identity)).toEqual(['trxlezi', 'ana', 'bruno']);
  });

  it('removes a participant who disconnects', () => {
    // specs/voice-session: "Participante perde a conexão"
    const room = run([
      joined('trxlezi', true),
      joined('pedro'),
      { type: 'PARTICIPANT_LEFT', identity: 'pedro' },
    ]);
    expect(listParticipants(room).map((p) => p.identity)).toEqual(['trxlezi']);
  });

  it('drops the share of a participant who disconnects while sharing', () => {
    const room = run([
      joined('pedro'),
      { type: 'SHARE_STARTED', identity: 'pedro', contentKind: 'motion', hasSystemAudio: true },
      { type: 'PARTICIPANT_LEFT', identity: 'pedro' },
    ]);
    expect(listShares(room)).toHaveLength(0);
  });

  it('tracks mute state', () => {
    const room = run([joined('pedro'), { type: 'MUTE_CHANGED', identity: 'pedro', isMuted: true }]);
    expect(room.participants.get('pedro')?.isMuted).toBe(true);
  });

  it('ignores mute for an unknown participant', () => {
    const room = emptyRoom();
    expect(reduceRoom(room, { type: 'MUTE_CHANGED', identity: 'ghost', isMuted: true })).toBe(room);
  });

  it('marks who is speaking', () => {
    // specs/voice-session: "Participante começa a falar"
    const room = run([
      joined('pedro'),
      joined('ana'),
      { type: 'SPEAKING_CHANGED', speaking: ['pedro'] },
    ]);
    expect(room.participants.get('pedro')?.isSpeaking).toBe(true);
    expect(room.participants.get('ana')?.isSpeaking).toBe(false);
  });

  it('returns the same object when the speaking set has not changed', () => {
    // Speaking events fire on every audio frame; identity here is what keeps
    // the participant list from re-rendering continuously.
    const room = run([joined('pedro'), { type: 'SPEAKING_CHANGED', speaking: ['pedro'] }]);
    expect(reduceRoom(room, { type: 'SPEAKING_CHANGED', speaking: ['pedro'] })).toBe(room);
  });

  it('supports simultaneous shares from different participants', () => {
    // specs/screen-sharing: "Compartilhamentos simultâneos"
    const room = run([
      joined('pedro'),
      joined('ana'),
      { type: 'SHARE_STARTED', identity: 'pedro', contentKind: 'motion', hasSystemAudio: true },
      { type: 'SHARE_STARTED', identity: 'ana', contentKind: 'detail', hasSystemAudio: false },
    ]);
    expect(listShares(room)).toHaveLength(2);
    expect(room.shares.get('ana')?.contentKind).toBe('detail');
    expect(room.shares.get('ana')?.hasSystemAudio).toBe(false);
  });

  it('clears the sharing flag when a share stops', () => {
    // specs/screen-sharing: "Quem compartilha encerra a transmissão"
    const room = run([
      joined('pedro'),
      { type: 'SHARE_STARTED', identity: 'pedro', contentKind: 'motion', hasSystemAudio: true },
      { type: 'SHARE_STOPPED', identity: 'pedro' },
    ]);
    expect(room.participants.get('pedro')?.isSharing).toBe(false);
    expect(listShares(room)).toHaveLength(0);
  });

  it('ignores a share from a participant who is not in the room', () => {
    const room = emptyRoom();
    const event: RoomEvent = {
      type: 'SHARE_STARTED',
      identity: 'ghost',
      contentKind: 'motion',
      hasSystemAudio: false,
    };
    expect(reduceRoom(room, event)).toBe(room);
  });

  it('empties on reset', () => {
    const room = run([joined('pedro'), { type: 'ROOM_RESET' }]);
    expect(listParticipants(room)).toHaveLength(0);
  });
});
