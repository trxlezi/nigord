import { type FormEvent, useState } from 'react';

export interface JoinFormProps {
  initialIdentity: string;
  initialRoom: string;
  busy: boolean;
  /** Null when there is nothing wrong. */
  error: string | null;
  onSubmit: (values: { identity: string; room: string }) => void;
}

/**
 * Entry screen (task 7.1).
 *
 * The error is passed in already distinguished — a rejected credential reads
 * differently from an unreachable server, because the fix is different
 * (specs/voice-session).
 */
export function JoinForm({
  initialIdentity,
  initialRoom,
  busy,
  error,
  onSubmit,
}: JoinFormProps): JSX.Element {
  const [identity, setIdentity] = useState(initialIdentity);
  const [room, setRoom] = useState(initialRoom || 'sala-principal');

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (!identity.trim() || !room.trim()) return;
    onSubmit({ identity: identity.trim(), room: room.trim() });
  };

  return (
    <form className="join" onSubmit={submit}>
      <h1 className="join__title">Nigord</h1>

      <label className="field">
        <span className="field__label">Seu nome</span>
        <input
          className="field__input"
          value={identity}
          onChange={(event) => setIdentity(event.target.value)}
          placeholder="como os outros vão te ver"
          maxLength={32}
          autoFocus
          disabled={busy}
        />
      </label>

      <label className="field">
        <span className="field__label">Sala</span>
        <input
          className="field__input"
          value={room}
          onChange={(event) => setRoom(event.target.value.toLowerCase())}
          placeholder="sala-principal"
          maxLength={64}
          disabled={busy}
        />
        <span className="field__hint">Letras minúsculas, números e traços.</span>
      </label>

      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      <button className="button button--primary" type="submit" disabled={busy || !identity.trim()}>
        {busy ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
