import { type FormEvent, useState } from 'react';
import type { ClientConfig } from '@nigord/shared';

export interface ServerSettingsProps {
  config: ClientConfig;
  /** Set when the last save was refused. */
  error: string | null;
  /**
   * True on the entry screen of a fresh install, where this is the first thing
   * the participant ever sees and needs to say what the app is.
   */
  firstRun?: boolean;
  onSave: (values: { tokenServerUrl?: string; groupSecret?: string }) => void;
}

/**
 * Where the app points and what it presents to get in (task 9.5).
 *
 * The secret field starts empty even when one is stored, because the stored
 * value is never sent to the interface — the app can only report that it has
 * one. Leaving the field blank keeps the existing secret; typing replaces it.
 */
export function ServerSettings({
  config,
  error,
  firstRun = false,
  onSave,
}: ServerSettingsProps): JSX.Element {
  const [url, setUrl] = useState(config.tokenServerUrl);
  const [secret, setSecret] = useState('');

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const values: { tokenServerUrl?: string; groupSecret?: string } = {};
    if (url.trim() && url.trim() !== config.tokenServerUrl) values.tokenServerUrl = url.trim();
    if (secret.trim()) values.groupSecret = secret.trim();
    if (Object.keys(values).length === 0) return;
    onSave(values);
    setSecret('');
  };

  if (config.fromEnvironment) {
    return (
      <section className="server">
        <h2 className="server__title">Servidor</h2>
        <p className="field__hint">
          Definido pelo ambiente ({config.tokenServerUrl}). Para editar aqui, remova as variáveis
          NIGORD_TOKEN_SERVER e NIGORD_GROUP_SECRET.
        </p>
      </section>
    );
  }

  return (
    <form className="server" onSubmit={submit}>
      {firstRun ? (
        <header className="server__intro">
          <h1 className="join__title">Nigord</h1>
          <p className="field__hint">
            Antes de entrar, aponte o app para o servidor do seu grupo. É uma vez só.
          </p>
        </header>
      ) : (
        <h2 className="server__title">Servidor</h2>
      )}

      <label className="field">
        <span className="field__label">Endereço do servidor</span>
        <input
          className="field__input"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://nigord-token.exemplo.dev"
          spellCheck={false}
        />
      </label>

      <label className="field">
        <span className="field__label">Segredo do grupo</span>
        <input
          className="field__input"
          type="password"
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
          placeholder={config.hasSecret ? 'já configurado — digite para trocar' : 'cole o segredo'}
          autoComplete="off"
        />
        <span className="field__hint">
          Quem cuida do servidor te passa. Fica guardado só nesta máquina.
        </span>
      </label>

      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      <button className="button" type="submit">
        Salvar
      </button>
    </form>
  );
}
