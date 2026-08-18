import type { ContentKind, Participant, ScreenShare } from '@nigord/shared';

/**
 * The room roster (task 4.3), kept as a pure reducer over events so that
 * presence, mute and speaking indication can be tested without a media server.
 */

export interface RoomModel {
  participants: ReadonlyMap<string, Participant>;
  shares: ReadonlyMap<string, ScreenShare>;
}

export const emptyRoom = (): RoomModel => ({ participants: new Map(), shares: new Map() });

export type RoomEvent =
  | { type: 'PARTICIPANT_JOINED'; identity: string; isLocal: boolean }
  | { type: 'PARTICIPANT_LEFT'; identity: string }
  | { type: 'MUTE_CHANGED'; identity: string; isMuted: boolean }
  | { type: 'SPEAKING_CHANGED'; speaking: readonly string[] }
  | { type: 'SHARE_STARTED'; identity: string; contentKind: ContentKind; hasSystemAudio: boolean }
  | { type: 'SHARE_STOPPED'; identity: string }
  | { type: 'ROOM_RESET' };

export function reduceRoom(model: RoomModel, event: RoomEvent): RoomModel {
  switch (event.type) {
    case 'PARTICIPANT_JOINED': {
      const participants = new Map(model.participants);
      // Rejoining preserves nothing: a fresh connection starts unmuted and
      // silent, and any stale share is dropped below.
      participants.set(event.identity, {
        identity: event.identity,
        isLocal: event.isLocal,
        isMuted: false,
        isSpeaking: false,
        isSharing: false,
      });
      const shares = new Map(model.shares);
      shares.delete(event.identity);
      return { participants, shares };
    }

    case 'PARTICIPANT_LEFT': {
      if (!model.participants.has(event.identity)) return model;
      const participants = new Map(model.participants);
      participants.delete(event.identity);
      // A participant who disappears takes their share with them, otherwise
      // viewers keep a dead tile on screen.
      const shares = new Map(model.shares);
      shares.delete(event.identity);
      return { participants, shares };
    }

    case 'MUTE_CHANGED': {
      const existing = model.participants.get(event.identity);
      if (!existing || existing.isMuted === event.isMuted) return model;
      const participants = new Map(model.participants);
      participants.set(event.identity, { ...existing, isMuted: event.isMuted });
      return { ...model, participants };
    }

    case 'SPEAKING_CHANGED': {
      const speaking = new Set(event.speaking);
      let changed = false;
      const participants = new Map(model.participants);
      for (const [identity, participant] of participants) {
        const isSpeaking = speaking.has(identity);
        if (participant.isSpeaking !== isSpeaking) {
          participants.set(identity, { ...participant, isSpeaking });
          changed = true;
        }
      }
      // Speaking events fire constantly; returning the same object when nothing
      // moved keeps the UI from re-rendering on every audio frame.
      return changed ? { ...model, participants } : model;
    }

    case 'SHARE_STARTED': {
      const existing = model.participants.get(event.identity);
      if (!existing) return model;
      const shares = new Map(model.shares);
      shares.set(event.identity, {
        identity: event.identity,
        contentKind: event.contentKind,
        hasSystemAudio: event.hasSystemAudio,
      });
      const participants = new Map(model.participants);
      participants.set(event.identity, { ...existing, isSharing: true });
      return { participants, shares };
    }

    case 'SHARE_STOPPED': {
      if (!model.shares.has(event.identity)) return model;
      const shares = new Map(model.shares);
      shares.delete(event.identity);
      const participants = new Map(model.participants);
      const existing = participants.get(event.identity);
      if (existing) participants.set(event.identity, { ...existing, isSharing: false });
      return { participants, shares };
    }

    case 'ROOM_RESET':
      return emptyRoom();
  }
}

export const listParticipants = (model: RoomModel): Participant[] =>
  [...model.participants.values()].sort((a, b) => {
    if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1;
    return a.identity.localeCompare(b.identity);
  });

/**
 * Shares available to WATCH — the local participant's own is excluded.
 *
 * Someone sharing their screen is already looking at it; offering it back would
 * be a mirror, and the stream is not even subscribable locally. The roster still
 * marks them as sharing, which is what the rest of the room sees.
 */
export const listShares = (model: RoomModel): ScreenShare[] =>
  [...model.shares.values()].filter((share) => !model.participants.get(share.identity)?.isLocal);
