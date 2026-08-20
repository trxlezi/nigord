import type { MicMode } from '@nigord/shared';
import {
  BITRATE_OPTIONS,
  FRAMERATE_OPTIONS,
  RESOLUTION_OPTIONS,
  type ShareQualityChoice,
} from './SourcePicker.js';

export interface SessionControlsProps {
  micMode: MicMode;
  transmitting: boolean;
  /** False when no microphone could be opened; the session runs listen-only. */
  hasMicrophone: boolean;
  isSharing: boolean;
  canShare: boolean;
  /** A qualidade em curso, editável sem parar a transmissão. */
  shareQuality: ShareQualityChoice;
  onShareQuality: (quality: ShareQualityChoice) => void;
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
  hasMicrophone,
  isSharing,
  canShare,
  shareQuality,
  onShareQuality,
  onToggleMute,
  onTogglePushToTalk,
  onShare,
  onStopSharing,
  onLeave,
}: SessionControlsProps): JSX.Element {
  /**
   * Aparece só enquanto se transmite, e muda a qualidade sem interromper.
   *
   * Este é o momento em que a escolha importa: a sala engasgou e quem mostra a
   * tela precisa baixar a resolução agora — reabrir o seletor significaria
   * parar de compartilhar e recomeçar, na frente de todo mundo.
   */
  const dial = <K extends keyof ShareQualityChoice>(
    label: string,
    key: K,
    options: readonly { value: ShareQualityChoice[K]; label: string }[],
    parse: (raw: string) => ShareQualityChoice[K],
  ): JSX.Element => (
    <label className="controls__dial">
      <span className="visually-hidden">{label}</span>
      <select
        className="field__input field__input--small"
        value={String(shareQuality[key])}
        aria-label={label}
        onChange={(event) => onShareQuality({ ...shareQuality, [key]: parse(event.target.value) })}
      >
        {options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="controls">
      <button
        className={`button ${micMode === 'muted' ? 'button--danger' : ''}`}
        onClick={onToggleMute}
        aria-pressed={micMode === 'muted'}
        disabled={!hasMicrophone}
      >
        {micMode === 'muted' ? 'Ativar microfone' : 'Silenciar'}
      </button>

      <button
        className={`button ${micMode === 'push-to-talk' ? 'button--active' : ''}`}
        onClick={onTogglePushToTalk}
        aria-pressed={micMode === 'push-to-talk'}
        disabled={!hasMicrophone}
      >
        Push-to-talk
      </button>

      {/* Without this the participant sees "em silêncio" and reasonably reads
          it as their own mute, then waits for an answer that cannot come. */}
      {hasMicrophone ? (
        <span
          className={`mic-state ${transmitting ? 'mic-state--live' : ''}`}
          role="status"
          aria-live="off"
        >
          {transmitting ? 'transmitindo' : 'em silêncio'}
        </span>
      ) : (
        <span className="mic-state mic-state--absent" role="status" aria-live="polite">
          sem microfone — você ouve, mas ninguém te ouve
        </span>
      )}

      <span className="controls__spacer" />

      {isSharing && (
        <div className="controls__quality" role="group" aria-label="Qualidade da transmissão">
          {dial('Resolução', 'resolution', RESOLUTION_OPTIONS, (raw) => raw as never)}
          {dial('Quadros', 'framerate', FRAMERATE_OPTIONS, (raw) => Number(raw) as never)}
          {dial('Bitrate', 'bitrate', BITRATE_OPTIONS, (raw) => raw as never)}
        </div>
      )}

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
