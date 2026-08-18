import { useCallback, useEffect, useState } from 'react';
import type { ClientConfig, ClientConfigPatch } from '@nigord/shared';
import { bridge } from './bridge.js';

export interface ConfigHandle {
  config: ClientConfig | null;
  error: string | null;
  save: (patch: ClientConfigPatch) => void;
}

/**
 * Connection settings live in the main process, which owns the file and never
 * hands the group secret back (task 9.5). The renderer only ever learns the
 * server address and whether a secret is stored.
 */
export function useConfig(): ConfigHandle {
  const [config, setConfig] = useState<ClientConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void bridge.invoke('config:get', {}).then(setConfig);
  }, []);

  const save = useCallback((patch: ClientConfigPatch) => {
    setError(null);
    void bridge.invoke('config:set', patch).then(setConfig, (reason: unknown) => {
      // The URL is validated by the shared schema, so a rejection here is
      // almost always a malformed address.
      setError(
        reason instanceof Error && /url/i.test(reason.message)
          ? 'Endereço inválido. Use uma URL completa, com https://'
          : 'Não foi possível salvar a configuração.',
      );
    });
  }, []);

  return { config, error, save };
}
