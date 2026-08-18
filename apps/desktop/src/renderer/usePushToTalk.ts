import { useCallback, useEffect, useRef, useState } from 'react';
import type { MicMode } from '@nigord/shared';
import type { Session } from '@nigord/core';
import { bridge } from './bridge.js';

export interface PushToTalkHandle {
  /** Set when the last registration was refused; the previous key stays bound. */
  error: string | null;
  /** Binds a new key, keeping the old one if the new one is refused. */
  rebind: (accelerator: string) => Promise<void>;
}

/**
 * Connects the global hotkey to the session's microphone gate (task 8.1).
 *
 * The key is only held by the operating system while push-to-talk is the active
 * mode. Keeping it registered in the other modes would take the key away from
 * every other application for no reason.
 */
export function usePushToTalk(
  session: Session,
  micMode: MicMode,
  accelerator: string,
  onPersist: (accelerator: string) => void,
): PushToTalkHandle {
  const [error, setError] = useState<string | null>(null);
  const bound = useRef<string | null>(null);

  useEffect(() => {
    const downs = bridge.on('hotkey:down', () => void session.setPushToTalkHeld(true));
    const ups = bridge.on('hotkey:up', () => void session.setPushToTalkHeld(false));
    return () => {
      downs();
      ups();
    };
  }, [session]);

  useEffect(() => {
    if (micMode !== 'push-to-talk') {
      if (bound.current === null) return;
      bound.current = null;
      void bridge.invoke('hotkey:unregister', {});
      // A key released while held must not leave the microphone open.
      void session.setPushToTalkHeld(false);
      return;
    }

    if (bound.current === accelerator) return;

    void (async () => {
      const result = await bridge.invoke('hotkey:register', { accelerator });
      if (result.ok) {
        bound.current = accelerator;
        setError(null);
        return;
      }
      setError(result.reason ?? `Não foi possível registrar ${accelerator}.`);
    })();
  }, [session, micMode, accelerator]);

  useEffect(() => () => void bridge.invoke('hotkey:unregister', {}), []);

  /**
   * Task 8.3: a conflict leaves the stored key untouched. The registration is
   * attempted first and only persisted once the operating system accepted it.
   */
  const rebind = useCallback(
    async (next: string) => {
      const result = await bridge.invoke('hotkey:register', { accelerator: next });
      if (!result.ok) {
        setError(
          result.reason ??
            `${next} já está em uso por outro programa. A tecla anterior continua valendo.`,
        );
        return;
      }
      bound.current = next;
      setError(null);
      onPersist(next);
    },
    [onPersist],
  );

  return { error, rebind };
}
