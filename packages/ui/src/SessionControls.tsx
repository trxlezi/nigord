import type { MicMode } from '@nigord/shared';

export interface SessionControlsProps {
  micMode: MicMode;
  transmitting: boolean;
  isSharing: boolean;
  canShare: boolean;
  onToggleMute: () => void;
  onTogglePushToTalk: () => void;
  onShare: () => void;
  onStopSharing: () => void;
  onLeave: () => void;
}

/**
 * Mute, push-to-talk, share, leave (task 7.3).
 *
 * The transmitting indicator is separate from the mode: in push-to-talk the
 * mode stays constant while transmission flickers with the key, and conflating
 * them would leave the participant unsure whether they were heard.
 */
export function SessionControls({
  micMode,
  transmitting,
  isSharing,
  canShare,
  onToggleMute,
  onTogglePushToTalk,
  onShare,
  onStopSharing,
  onLeave,
}: SessionControlsProps): JSX.Element {
  return (
    <div className="controls">
      <button
        className={`button ${micMode === 'muted' ? 'button--danger' : ''}`}
        onClick={onToggleMute}
        aria-pressed={micMode === 'muted'}
      >
        {micMode === 'muted' ? 'Ativar microfone' : 'Silenciar'}
      </button>

      <button
        className={`button ${micMode === 'push-to-talk' ? 'button--active' : ''}`}
        onClick={onTogglePushToTalk}
        aria-pressed={micMode === 'push-to-talk'}
      >
        Push-to-talk
      </button>

      <span
        className={`mic-state ${transmitting ? 'mic-state--live' : ''}`}
        role="status"
        aria-live="off"
      >
        {transmitting ? 'transmitindo' : 'em silêncio'}
      </span>

      <span className="controls__spacer" />

      {isSharing ? (
        <button className="button" onClick={onStopSharing}>
          Parar de compartilhar
        </button>
      ) : (
        <button className="button" onClick={onShare} disabled={!canShare}>
          Compartilhar tela
        </button>
      )}

      <button className="button button--danger" onClick={onLeave}>
        Sair
      </button>
    </div>
  );
}
