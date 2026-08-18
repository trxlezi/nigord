import type { ConnectionState, DisconnectReason } from '@nigord/shared';

/**
 * The session lifecycle, as a pure state machine (task 4.1).
 *
 * Deliberately free of LiveKit, timers and I/O — it only decides what state a
 * given event leads to. That is what lets the reconnection policy, which is the
 * part most likely to be wrong, be tested exhaustively in milliseconds instead
 * of by unplugging a network cable.
 */

export type SessionEvent =
  | { type: 'CONNECT' }
  | { type: 'CONNECTED' }
  | { type: 'CONNECTION_LOST' }
  | { type: 'RECONNECTED' }
  | { type: 'RETRY_FAILED' }
  | { type: 'DISCONNECT'; reason: DisconnectReason };

export interface SessionSnapshot {
  state: ConnectionState;
  /** Consecutive failed reconnection attempts. Resets on a successful connect. */
  attempts: number;
  /** Why the session ended. Null while a session is alive. */
  reason: DisconnectReason | null;
}

export const initialSnapshot = (): SessionSnapshot => ({
  state: 'disconnected',
  attempts: 0,
  reason: null,
});

/**
 * How many consecutive reconnection attempts before giving up and ending the
 * session. specs/voice-session requires that a persistent failure surfaces as
 * an ended session with the option to rejoin, not an infinite spinner.
 */
export const MAX_RECONNECT_ATTEMPTS = 5;

export function transition(current: SessionSnapshot, event: SessionEvent): SessionSnapshot {
  switch (event.type) {
    case 'CONNECT':
      // Ignored unless idle: a second join while connecting must not reset
      // the attempt counter or produce two rooms.
      if (current.state !== 'disconnected') return current;
      return { state: 'connecting', attempts: 0, reason: null };

    case 'CONNECTED':
      if (current.state !== 'connecting') return current;
      return { state: 'connected', attempts: 0, reason: null };

    case 'CONNECTION_LOST':
      // Only a live session can drop. Losing a connection we never had is a
      // failed connect, handled by RETRY_FAILED.
      if (current.state !== 'connected' && current.state !== 'reconnecting') return current;
      return { ...current, state: 'reconnecting' };

    case 'RECONNECTED':
      if (current.state !== 'reconnecting') return current;
      return { state: 'connected', attempts: 0, reason: null };

    case 'RETRY_FAILED': {
      if (current.state !== 'reconnecting' && current.state !== 'connecting') return current;
      const attempts = current.attempts + 1;
      if (attempts >= MAX_RECONNECT_ATTEMPTS) {
        return { state: 'disconnected', attempts, reason: 'connection_lost' };
      }
      return { ...current, state: 'reconnecting', attempts };
    }

    case 'DISCONNECT':
      if (current.state === 'disconnected') return current;
      return { state: 'disconnected', attempts: 0, reason: event.reason };
  }
}

/** True while the session should be holding media open. */
export const isLive = (snapshot: SessionSnapshot): boolean =>
  snapshot.state === 'connected' || snapshot.state === 'reconnecting';

/**
 * Backoff before the next reconnection attempt, in milliseconds. Capped so a
 * long outage does not leave the participant waiting minutes after the network
 * returns.
 */
export function retryDelayMs(attempts: number): number {
  return Math.min(1000 * 2 ** attempts, 15_000);
}
