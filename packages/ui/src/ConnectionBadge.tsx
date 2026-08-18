import type { ConnectionState, DisconnectReason } from '@nigord/shared';

/**
 * Connection state, including reconnection in progress (task 7.8).
 *
 * Reconnecting is deliberately loud: during an outage the participant is
 * talking into a void, and the fastest way to make that obvious is to say so.
 */
const LABELS: Record<ConnectionState, string> = {
  disconnected: 'Desconectado',
  connecting: 'Conectando…',
  connected: 'Conectado',
  reconnecting: 'Reconectando…',
};

const REASONS: Record<DisconnectReason, string> = {
  user_left: 'Você saiu da sala.',
  connection_lost: 'A conexão caiu e não foi possível restabelecer.',
  duplicate_identity: 'Esse nome entrou em outro dispositivo.',
  token_rejected: 'Credencial recusada.',
  server_shutdown: 'O servidor encerrou a sala.',
  unknown: 'A sessão terminou.',
};

export function ConnectionBadge({
  state,
  reason,
}: {
  state: ConnectionState;
  reason: DisconnectReason | null;
}): JSX.Element {
  return (
    <div className={`badge badge--${state}`} role="status" aria-live="polite">
      <span className="badge__dot" aria-hidden="true" />
      <span>{LABELS[state]}</span>
      {state === 'disconnected' && reason && reason !== 'user_left' && (
        <span className="badge__reason">{REASONS[reason]}</span>
      )}
    </div>
  );
}
