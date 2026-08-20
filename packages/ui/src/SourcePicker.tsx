import { useState } from 'react';
import type {
  Capability,
  CaptureSource,
  ContentKind,
  ShareBitrateName,
  ShareFramerateValue,
  ShareResolutionName,
} from '@nigord/shared';

export interface ShareQualityChoice {
  resolution: ShareResolutionName;
  framerate: ShareFramerateValue;
  bitrate: ShareBitrateName;
}

export interface SourcePickerProps {
  sources: readonly CaptureSource[];
  systemAudio: Capability;
  defaultContentKind: ContentKind;
  defaultIncludeSystemAudio: boolean;
  defaultQuality: ShareQualityChoice;
  onCancel: () => void;
  onConfirm: (choice: {
    sourceId: string;
    contentKind: ContentKind;
    includeSystemAudio: boolean;
    quality: ShareQualityChoice;
  }) => void;
}

/**
 * Os valores aparecem escritos porque a escolha é de quem transmite e vale para
 * todos: "1080p a 60 quadros, até 4 Mbps" é uma frase que quem mostra a tela
 * consegue avaliar contra a própria internet. "Alta/média/baixa" não é.
 */
export const RESOLUTION_OPTIONS: { value: ShareResolutionName; label: string }[] = [
  { value: '1080p', label: '1080p' },
  { value: '720p', label: '720p' },
  { value: '480p', label: '480p' },
  { value: '360p', label: '360p' },
];

export const FRAMERATE_OPTIONS: { value: ShareFramerateValue; label: string }[] = [
  { value: 60, label: '60 fps' },
  { value: 30, label: '30 fps' },
  { value: 24, label: '24 fps' },
  { value: 15, label: '15 fps' },
];

export const BITRATE_OPTIONS: { value: ShareBitrateName; label: string }[] = [
  { value: 'high', label: 'Alto — até 4 Mbps' },
  { value: 'medium', label: 'Médio — até 2 Mbps' },
  { value: 'low', label: 'Baixo — até 700 kbps' },
];

/**
 * Screen/window picker with preview (task 7.4).
 *
 * When system audio is unavailable the checkbox is disabled and the platform's
 * own reason is shown verbatim — specs/screen-sharing requires the reason, and
 * the honest stub in the main process is what produces it.
 */
export function SourcePicker({
  sources,
  systemAudio,
  defaultContentKind,
  defaultIncludeSystemAudio,
  defaultQuality,
  onCancel,
  onConfirm,
}: SourcePickerProps): JSX.Element {
  const [selected, setSelected] = useState<string | null>(null);
  const [contentKind, setContentKind] = useState<ContentKind>(defaultContentKind);
  const [quality, setQuality] = useState<ShareQualityChoice>(defaultQuality);
  const [includeSystemAudio, setIncludeSystemAudio] = useState(
    defaultIncludeSystemAudio && systemAudio.available,
  );

  const screens = sources.filter((source) => source.kind === 'screen');
  const windows = sources.filter((source) => source.kind === 'window');

  const group = (title: string, items: readonly CaptureSource[]): JSX.Element | null =>
    items.length === 0 ? null : (
      <section className="picker__group">
        <h3 className="picker__group-title">{title}</h3>
        <div className="picker__grid">
          {items.map((source) => (
            <button
              key={source.id}
              className={`thumb ${selected === source.id ? 'thumb--selected' : ''}`}
              onClick={() => setSelected(source.id)}
              aria-pressed={selected === source.id}
            >
              {source.thumbnail ? (
                <img className="thumb__image" src={source.thumbnail} alt="" />
              ) : (
                <span className="thumb__image thumb__image--empty" />
              )}
              <span className="thumb__name">{source.name}</span>
            </button>
          ))}
        </div>
      </section>
    );

  return (
    <div className="picker" role="dialog" aria-label="Escolher o que compartilhar">
      <h2 className="picker__title">Compartilhar</h2>

      <div className="picker__sources">
        {group('Telas', screens)}
        {group('Janelas', windows)}
        {sources.length === 0 && <p className="muted">Nenhuma fonte disponível.</p>}
      </div>

      <fieldset className="picker__options">
        <legend className="field__label">Qualidade</legend>
        <p className="field__hint">
          Todos veem nesta qualidade. Quem não tiver internet para acompanhar vai ver travando.
        </p>

        <div className="picker__dials">
          <label className="field">
            <span className="field__label">Resolução</span>
            <select
              className="field__input"
              value={quality.resolution}
              onChange={(event) =>
                setQuality({
                  ...quality,
                  resolution: event.target.value as ShareResolutionName,
                })
              }
            >
              {RESOLUTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field__label">Quadros</span>
            <select
              className="field__input"
              value={quality.framerate}
              onChange={(event) =>
                setQuality({
                  ...quality,
                  framerate: Number(event.target.value) as ShareFramerateValue,
                })
              }
            >
              {FRAMERATE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field__label">Bitrate</span>
            <select
              className="field__input"
              value={quality.bitrate}
              onChange={(event) =>
                setQuality({ ...quality, bitrate: event.target.value as ShareBitrateName })
              }
            >
              {BITRATE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset className="picker__options">
        <legend className="field__label">Tipo de conteúdo</legend>
        <p className="field__hint">
          Não é a mesma coisa que a qualidade acima: isto diz ao codificador o que a imagem é, para
          ele saber onde gastar o bitrate que tem.
        </p>
        <label className="radio">
          <input
            type="radio"
            checked={contentKind === 'motion'}
            onChange={() => setContentKind('motion')}
          />
          <span>
            Jogo ou vídeo <span className="muted">— prioriza fluidez</span>
          </span>
        </label>
        <label className="radio">
          <input
            type="radio"
            checked={contentKind === 'detail'}
            onChange={() => setContentKind('detail')}
          />
          <span>
            Código ou texto <span className="muted">— prioriza nitidez</span>
          </span>
        </label>
      </fieldset>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={includeSystemAudio}
          disabled={!systemAudio.available}
          onChange={(event) => setIncludeSystemAudio(event.target.checked)}
        />
        <span>Incluir o áudio do sistema</span>
      </label>
      {!systemAudio.available && systemAudio.reason && (
        <p className="picker__unavailable">{systemAudio.reason}</p>
      )}

      <div className="picker__actions">
        <button className="button" onClick={onCancel}>
          Cancelar
        </button>
        <button
          className="button button--primary"
          disabled={!selected}
          onClick={() =>
            selected && onConfirm({ sourceId: selected, contentKind, includeSystemAudio, quality })
          }
        >
          Compartilhar
        </button>
      </div>
    </div>
  );
}
