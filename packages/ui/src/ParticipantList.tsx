import type { Participant } from '@nigord/shared';

export interface ParticipantListProps {
  participants: readonly Participant[];
  /** Identities this viewer has silenced locally. */
  locallyMuted: readonly string[];
  onToggleLocalMute: (identity: string) => void;
}

/**
 * Who is in the room, who is talking, who is sharing (task 7.2).
 *
 * Speaking is shown with a border rather than a colour swap so it stays legible
 * for colour-blind viewers and does not make the list jump on every syllable.
 */
export function ParticipantList({
  participants,
  locallyMuted,
  onToggleLocalMute,
}: ParticipantListProps): JSX.Element {
  return (
    <ul className="roster">
      {participants.map((participant) => {
        const silenced = locallyMuted.includes(participant.identity);
        return (
          <li
            key={participant.identity}
            className={[
              'roster__item',
              participant.isSpeaking ? 'roster__item--speaking' : '',
              participant.isMuted ? 'roster__item--muted' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span className="roster__name">
              {participant.identity}
              {participant.isLocal && <span className="roster__you"> (você)</span>}
            </span>

            <span className="roster__tags">
              {participant.isSharing && (
                <span className="tag tag--sharing" title="Compartilhando a tela">
                  tela
                </span>
              )}
              {participant.isMuted && (
                <span className="tag" title="Microfone silenciado">
                  mudo
                </span>
              )}
            </span>

            {!participant.isLocal && (
              <button
                className="roster__action"
                onClick={() => onToggleLocalMute(participant.identity)}
                title={silenced ? 'Voltar a ouvir' : 'Silenciar só para mim'}
                aria-pressed={silenced}
              >
                {silenced ? 'ouvir' : 'silenciar'}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
