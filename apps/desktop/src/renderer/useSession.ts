import { useCallback, useEffect, useState } from 'react';
import { LiveKitRoomClient, Session, type SessionView } from '@nigord/core';
import { type TokenFailureCode, decodeTokenFailure } from '@nigord/shared';
import { bridge } from './bridge.js';

export interface JoinFailure {
  /** Distinguished so the entry screen can say which thing to fix (task 7.1). */
  kind: 'credential' | 'network' | 'config';
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
 *
 * It is deliberately never disposed. The Session lives exactly as long as this
 * window, so tearing it down on unmount would only matter in StrictMode's
 * double-mount, where it would leave the second mount holding a dead room. The
 * main process ends the session when the window really goes away.
 */
export function useSession(inputDeviceId: string): SessionHandle {
  // Lazy state, not useMemo: this must be created exactly once. useMemo is a
  // performance hint React is free to discard, and discarding the Session would
  // drop the LiveKit room along with it.
  const [session] = useState(() => new Session({ client: new LiveKitRoomClient(), inputDeviceId }));

  const [view, setView] = useState<SessionView>(() => session.view);
  const [joining, setJoining] = useState(false);
  const [failure, setFailure] = useState<JoinFailure | null>(null);

  useEffect(() => session.on('changed', setView), [session]);

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
 *
 * The decision is made on the code the main process encoded, never on the prose:
 * Electron wraps IPC failures in text containing the channel name, and
 * `token:request` matching a keyword made every network outage read as a bad
 * secret.
 */
const MESSAGES: Record<TokenFailureCode, JoinFailure> = {
  unauthorized: {
    kind: 'credential',
    message: 'A credencial do grupo foi recusada. Confira o segredo configurado.',
  },
  invalid_request: {
    kind: 'credential',
    message: 'O nome ou a sala não são aceitos. Use letras minúsculas, números e traços.',
  },
  rate_limited: {
    kind: 'network',
    message: 'Muitas tentativas em pouco tempo. Espere alguns instantes e tente de novo.',
  },
  server_error: {
    kind: 'network',
    message: 'O servidor de credenciais respondeu com erro. Tente de novo em instantes.',
  },
  unreachable: {
    kind: 'network',
    message: 'Não foi possível alcançar o servidor. Verifique sua conexão e tente de novo.',
  },
  unconfigured: {
    kind: 'config',
    message: 'Configure o servidor e o segredo do grupo antes de entrar.',
  },
};

function classify(error: unknown): JoinFailure {
  const text = error instanceof Error ? error.message : String(error);
  const failure = decodeTokenFailure(text);
  if (failure) return MESSAGES[failure.code];

  // Anything without a code did not come from the token request: the room
  // connection or the microphone failed after the token was issued. Those
  // causes are unrelated and only the underlying message distinguishes them,
  // so it is carried through instead of being replaced by a generic line that
  // sent participants looking in the wrong place.
  return {
    kind: 'network',
    message: text
      ? `A conexão com a sala falhou: ${text}`
      : 'A conexão com a sala falhou. Verifique sua conexão e tente de novo.',
  };
}
