/**
 * Says out loud that the system is refusing to play audio.
 *
 * Without this the failure is invisible: the room connects, the roster fills,
 * the speaking indicators move, and nobody is heard — which reads as a broken
 * application rather than as a permission that one click would grant. The first
 * real session was lost to exactly that ambiguity.
 */
export function AudioBlockedNotice({ onEnable }: { onEnable: () => void }): JSX.Element {
  return (
    <div className="audio-blocked" role="alert">
      <span>O sistema está bloqueando a reprodução de áudio — você não ouve ninguém.</span>
      <button className="button button--small" onClick={onEnable}>
        Ativar o som
      </button>
    </div>
  );
}
