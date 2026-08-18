import { useState } from 'react';
import type { Capability, CaptureSource, ContentKind } from '@nigord/shared';

export interface SourcePickerProps {
  sources: readonly CaptureSource[];
  systemAudio: Capability;
  defaultContentKind: ContentKind;
  defaultIncludeSystemAudio: boolean;
  onCancel: () => void;
  onConfirm: (choice: {
    sourceId: string;
    contentKind: ContentKind;
    includeSystemAudio: boolean;
  }) => void;
}

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
  onCancel,
  onConfirm,
}: SourcePickerProps): JSX.Element {
  const [selected, setSelected] = useState<string | null>(null);
  const [contentKind, setContentKind] = useState<ContentKind>(defaultContentKind);
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
        <legend className="field__label">Tipo de conteúdo</legend>
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
            selected && onConfirm({ sourceId: selected, contentKind, includeSystemAudio })
          }
        >
          Compartilhar
        </button>
      </div>
    </div>
  );
}
