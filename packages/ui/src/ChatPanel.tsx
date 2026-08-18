import { useEffect, useRef, useState } from 'react';
import { CHAT_MAX_LENGTH, type ChatMessage } from '@nigord/shared';

export interface ChatPanelProps {
  messages: readonly ChatMessage[];
  /** This viewer's identity, so their own lines read as theirs. */
  localIdentity: string | null;
  onSend: (text: string) => void;
}

const time = (at: number): string =>
  new Date(at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/**
 * Chat for the session, and only for the session.
 *
 * There is no history to load and none to save: the messages live in the room
 * and leave with it. That is a deliberate limit, so the empty state says so
 * rather than looking like something failed to load.
 */
export function ChatPanel({ messages, localIdentity, onSend }: ChatPanelProps): JSX.Element {
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  // Following the tail is the whole reading behaviour of a live chat; without
  // this a new line lands below the fold and is simply missed.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  const submit = (): void => {
    const text = draft.trim();
    if (text === '') return;
    onSend(text);
    setDraft('');
  };

  return (
    <section className="chat">
      <h2 className="chat__title">Chat</h2>

      <div className="chat__log" role="log" aria-live="polite" aria-label="Mensagens">
        {messages.length === 0 ? (
          <p className="muted chat__empty">
            Nada ainda. As mensagens somem quando você sai da sala.
          </p>
        ) : (
          messages.map((message) => (
            <p
              key={message.id}
              className={`chat__line ${
                message.identity === localIdentity ? 'chat__line--own' : ''
              }`}
            >
              <span className="chat__who">{message.identity}</span>
              <span className="chat__at">{time(message.at)}</span>
              <span className="chat__text">{message.text}</span>
            </p>
          ))
        )}
        <div ref={endRef} />
      </div>

      <form
        className="chat__form"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <input
          className="chat__input"
          value={draft}
          maxLength={CHAT_MAX_LENGTH}
          placeholder="Mensagem"
          aria-label="Mensagem"
          onChange={(event) => setDraft(event.target.value)}
        />
        <button className="button button--small" type="submit" disabled={draft.trim() === ''}>
          Enviar
        </button>
      </form>
    </section>
  );
}
