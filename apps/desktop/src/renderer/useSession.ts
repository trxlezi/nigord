import { useCallback, useEffect, useRef, useState } from 'react';
import { LiveKitRoomClient, Session, type SessionView } from '@nigord/core';
import { bridge } from './bridge.js';

export interface JoinFailure {
  /** Distinguished so the entry screen can say which thing to fix (task 7.1). */
  kind: 'credential' | 'network';
  message: string;
}

export interface SessionHandle {
  view: SessionView;
  joining: boolean;
  failure: JoinFailure | null;
  session: Session;
  join: (values: { identity: string; room: string }) => Promise<void>;
  leave: () => Promise<void>;
}

/**
 * Binds the platform-agnostic Session to React.
 *
 * The Session is created once and never recreated: it owns the LiveKit room,
 * and rebuilding it on a re-render would drop the connection. React only reads
 * its published view.
 */
export function useSession(inputDeviceId: string): SessionHandle {
  // Lazy state, not useMemo: this must be created exactly once. useMemo is a
  // performance hint React is free to discard, and discarding the Session would
  // drop the LiveKit room along with it.
  const [session] = useState(() => new Session({ client: new LiveKitRoomClient(), inputDeviceId }));

  const [view, setView] = useState<SessionView>(() => session.view);
  const [joining, setJoining] = useState(false);
  const [failure, setFailure] = useState<JoinFailure | null>(null);
  const disposed = useRef(false);

  useEffect(() => {
    const unsubscribe = session.on('changed', setView);
    return () => {
      unsubscribe();
      // StrictMode mounts twice in development; disposing the room on the first
      // unmount would leave the second mount with a dead session.
      if (!disposed.current) return;
      session.dispose();
    };
  }, [session]);

  useEffect(
    () => () => {
      disposed.current = true;
    },
    [],
  );

  const join = useCallback(
    async ({ identity, room }: { identity: string; room: string }) => {
      setJoining(true);
      setFailure(null);
      try {
        const { token, url } = await bridge.invoke('token:request', { room, identity });
        await session.join({ url, token, identity });
        await bridge.invoke('prefs:set', { identity, lastRoom: room });
      } catch (error) {
        setFailure(classify(error));
      } finally {
        setJoining(false);
      }
    },
    [session],
  );

  const leave = useCallback(async () => {
    await session.leave();
    await bridge.invoke('capture:stop', {});
  }, [session]);

  return { view, joining, failure, session, join, leave };
}

/**
 * A rejected credential and an unreachable server need different actions from
 * the participant, so they are never collapsed into one message
 * (specs/voice-session, "Falha ao entrar na sala").
 */
function classify(error: unknown): JoinFailure {
  const message = error instanceof Error ? error.message : String(error);

  if (/401|403|secret|token|credential|unauthor/i.test(message)) {
    return {
      kind: 'credential',
      message: 'A credencial do grupo foi recusada. Confira o segredo configurado.',
    };
  }
  return {
    kind: 'network',
    message: 'Não foi possível alcançar o servidor. Verifique sua conexão e tente de novo.',
  };
}
