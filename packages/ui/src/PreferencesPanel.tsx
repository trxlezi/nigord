import { type ReactNode, useState } from 'react';
import type { Capability } from '@nigord/shared';

export interface AudioDevice {
  deviceId: string;
  label: string;
}

export interface PreferencesPanelProps {
  inputDevices: readonly AudioDevice[];
  outputDevices: readonly AudioDevice[];
  inputDeviceId: string;
  outputDeviceId: string;
  pushToTalkKey: string;
  hotkeys: Capability;
  /** Set when the last key registration was refused. */
  hotkeyError: string | null;
  onInputDevice: (deviceId: string) => void;
  onOutputDevice: (deviceId: string) => void;
  onPushToTalkKey: (accelerator: string) => void;
  onClose: () => void;
  /** Connection settings, passed in so this package stays free of IPC. */
  children?: ReactNode;
}

/**
 * Devices and push-to-talk key (task 7.7, 8.2).
 *
 * Key capture reads the real key event rather than offering a dropdown, so the
 * participant binds the key they actually press. A refused registration leaves
 * the previous binding in place and says why (specs/voice-session).
 */
export function PreferencesPanel({
  inputDevices,
  outputDevices,
  inputDeviceId,
  outputDeviceId,
  pushToTalkKey,
  hotkeys,
  hotkeyError,
  onInputDevice,
  onOutputDevice,
  onPushToTalkKey,
  onClose,
  children,
}: PreferencesPanelProps): JSX.Element {
  const [capturing, setCapturing] = useState(false);

  const captureKey = (event: React.KeyboardEvent): void => {
    event.preventDefault();
    const accelerator = toAccelerator(event);
    if (!accelerator) return;
    setCapturing(false);
    onPushToTalkKey(accelerator);
  };

  return (
    <section className="prefs" role="dialog" aria-label="Preferências">
      <h2 className="prefs__title">Preferências</h2>

      <label className="field">
        <span className="field__label">Microfone</span>
        <select
          className="field__input"
          value={inputDeviceId}
          onChange={(event) => onInputDevice(event.target.value)}
        >
          <option value="default">Padrão do sistema</option>
          {inputDevices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span className="field__label">Saída de áudio</span>
        <select
          className="field__input"
          value={outputDeviceId}
          onChange={(event) => onOutputDevice(event.target.value)}
        >
          <option value="default">Padrão do sistema</option>
          {outputDevices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label}
            </option>
          ))}
        </select>
      </label>

      <div className="field">
        <span className="field__label">Tecla de push-to-talk</span>
        <button
          className={`button ${capturing ? 'button--active' : ''}`}
          onClick={() => setCapturing(true)}
          onKeyDown={capturing ? captureKey : undefined}
          disabled={!hotkeys.available}
        >
          {capturing ? 'Pressione uma tecla…' : pushToTalkKey}
        </button>
        {!hotkeys.available && hotkeys.reason && (
          <span className="field__hint">{hotkeys.reason}</span>
        )}
        {hotkeyError && (
          <p className="alert" role="alert">
            {hotkeyError}
          </p>
        )}
      </div>

      {children}

      <div className="prefs__actions">
        <button className="button" onClick={onClose}>
          Fechar
        </button>
      </div>
    </section>
  );
}

/**
 * Translates a browser key event into an Electron accelerator string.
 * Returns null for a bare modifier, which is never a usable binding on its own.
 */
function toAccelerator(event: React.KeyboardEvent): string | null {
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return null;

  const parts: string[] = [];
  if (event.ctrlKey) parts.push('CommandOrControl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');

  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  parts.push(key);
  return parts.join('+');
}
