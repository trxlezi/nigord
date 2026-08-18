import { describe, expect, it } from 'vitest';
import {
  MAX_RECONNECT_ATTEMPTS,
  type SessionEvent,
  type SessionSnapshot,
  initialSnapshot,
  isLive,
  retryDelayMs,
  transition,
} from './machine.js';

const run = (events: SessionEvent[], from: SessionSnapshot = initialSnapshot()): SessionSnapshot =>
  events.reduce(transition, from);

describe('session state machine', () => {
  it('starts disconnected', () => {
    expect(initialSnapshot().state).toBe('disconnected');
  });

  it('walks the happy path to connected', () => {
    const snapshot = run([{ type: 'CONNECT' }, { type: 'CONNECTED' }]);
    expect(snapshot.state).toBe('connected');
    expect(snapshot.reason).toBeNull();
  });

  it('ignores a second connect while already connecting', () => {
    const connecting = run([{ type: 'CONNECT' }]);
    expect(transition(connecting, { type: 'CONNECT' })).toBe(connecting);
  });

  it('enters reconnecting when a live connection drops', () => {
    // specs/voice-session: "Queda temporária de rede"
    const snapshot = run([{ type: 'CONNECT' }, { type: 'CONNECTED' }, { type: 'CONNECTION_LOST' }]);
    expect(snapshot.state).toBe('reconnecting');
    expect(isLive(snapshot)).toBe(true);
  });

  it('returns to connected and clears attempts after reconnecting', () => {
    const snapshot = run([
      { type: 'CONNECT' },
      { type: 'CONNECTED' },
      { type: 'CONNECTION_LOST' },
      { type: 'RETRY_FAILED' },
      { type: 'RECONNECTED' },
    ]);
    expect(snapshot.state).toBe('connected');
    expect(snapshot.attempts).toBe(0);
  });

  it('gives up after the attempt limit and reports why', () => {
    // specs/voice-session: "Falha persistente"
    const events: SessionEvent[] = [
      { type: 'CONNECT' },
      { type: 'CONNECTED' },
      { type: 'CONNECTION_LOST' },
      ...Array.from({ length: MAX_RECONNECT_ATTEMPTS }, () => ({ type: 'RETRY_FAILED' }) as const),
    ];
    const snapshot = run(events);
    expect(snapshot.state).toBe('disconnected');
    expect(snapshot.reason).toBe('connection_lost');
    expect(isLive(snapshot)).toBe(false);
  });

  it('stays reconnecting while under the attempt limit', () => {
    const events: SessionEvent[] = [
      { type: 'CONNECT' },
      { type: 'CONNECTED' },
      { type: 'CONNECTION_LOST' },
      ...Array.from(
        { length: MAX_RECONNECT_ATTEMPTS - 1 },
        () => ({ type: 'RETRY_FAILED' }) as const,
      ),
    ];
    expect(run(events).state).toBe('reconnecting');
  });

  it('records the reason on an explicit disconnect', () => {
    const snapshot = run([
      { type: 'CONNECT' },
      { type: 'CONNECTED' },
      { type: 'DISCONNECT', reason: 'user_left' },
    ]);
    expect(snapshot.state).toBe('disconnected');
    expect(snapshot.reason).toBe('user_left');
  });

  it('does not overwrite the reason of an already-ended session', () => {
    const ended = run([
      { type: 'CONNECT' },
      { type: 'CONNECTED' },
      { type: 'DISCONNECT', reason: 'duplicate_identity' },
    ]);
    expect(transition(ended, { type: 'DISCONNECT', reason: 'unknown' })).toBe(ended);
  });

  it('ignores a connection loss when there was no connection', () => {
    const idle = initialSnapshot();
    expect(transition(idle, { type: 'CONNECTION_LOST' })).toBe(idle);
  });

  it('backs off exponentially but stays bounded', () => {
    expect(retryDelayMs(0)).toBe(1000);
    expect(retryDelayMs(1)).toBe(2000);
    expect(retryDelayMs(3)).toBe(8000);
    expect(retryDelayMs(20)).toBe(15_000);
  });
});
