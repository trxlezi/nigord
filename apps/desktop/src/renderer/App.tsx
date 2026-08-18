import { useEffect, useState } from 'react';
import type { CaptureCapabilities } from '@nigord/shared';
import { bridge } from './bridge.js';

/**
 * Placeholder shell. The real interface is task group 7 — this exists so the
 * Electron wrapper can be started and the platform boundary observed from the
 * renderer side.
 */
export function App(): JSX.Element {
  const [capabilities, setCapabilities] = useState<CaptureCapabilities | null>(null);
  const [version, setVersion] = useState('');

  useEffect(() => {
    void bridge.invoke('capture:capabilities', {}).then(setCapabilities);
    void bridge.invoke('app:version', {}).then(({ version: v }) => setVersion(v));
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 32, color: '#e6e8ee' }}>
      <h1>Nigord {version}</h1>
      <p>Capacidades desta plataforma:</p>
      <ul>
        {capabilities &&
          Object.entries(capabilities).map(([name, capability]) => (
            <li key={name}>
              <strong>{name}</strong>: {capability.available ? 'disponível' : 'indisponível'}
              {capability.reason ? ` — ${capability.reason}` : ''}
            </li>
          ))}
      </ul>
    </main>
  );
}
