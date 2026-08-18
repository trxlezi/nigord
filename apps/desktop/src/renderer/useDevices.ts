import { useCallback, useEffect, useState } from 'react';
import type { AudioDevice } from '@nigord/ui';
import { bridge } from './bridge.js';

export interface DeviceLists {
  inputs: AudioDevice[];
  outputs: AudioDevice[];
}

/**
 * Audio devices, refreshed when the set changes mid-session (task 7.7).
 *
 * Labels are only populated once microphone permission has been granted, so
 * this runs after the session has published a microphone at least once; before
 * that the panel falls back to "system default".
 */
export function useDevices(): DeviceLists {
  const [devices, setDevices] = useState<DeviceLists>({ inputs: [], outputs: [] });

  const refresh = useCallback(async () => {
    const all = await navigator.mediaDevices.enumerateDevices();
    const pick = (kind: MediaDeviceKind): AudioDevice[] =>
      all
        .filter((device) => device.kind === kind && device.deviceId !== 'default')
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Dispositivo ${index + 1}`,
        }));

    setDevices({ inputs: pick('audioinput'), outputs: pick('audiooutput') });
  }, []);

  useEffect(() => {
    void refresh();

    const onChange = (): void => void refresh();
    navigator.mediaDevices.addEventListener('devicechange', onChange);
    // The main process also reports device changes, which covers the cases
    // where Chromium's own event does not fire on Windows.
    const unsubscribe = bridge.on('devices:changed', onChange);

    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', onChange);
      unsubscribe();
    };
  }, [refresh]);

  return devices;
}
