import { useEffect, useRef } from 'react';
import type { ScreenShare } from '@nigord/shared';

export interface ShareViewerProps {
  shares: readonly ScreenShare[];
  /** Identity whose share is being watched, or null for none. */
  watching: string | null;
  /** This viewer's own identity, so their share reads as a preview. */
  localIdentity: string | null;
  expanded: boolean;
  /** Resolves a share to the stream to play, if it is subscribed yet. */
  streamFor: (identity: string) => MediaStream | null;
  onWatch: (identity: string | null) => void;
  onToggleExpanded: () => void;
}

/**
 * Watching someone else's screen (task 7.5).
 *
 * The video element is muted: audio arrives on its own track and is routed
 * through the volume panel, so playing it here too would double it and take
 * the independent volume control away.
 */
export function ShareViewer({
  shares,
  watching,
  localIdentity,
  expanded,
  streamFor,
  onWatch,
  onToggleExpanded,
}: ShareViewerProps): JSX.Element | null {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stream = watching ? streamFor(watching) : null;

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    element.srcObject = stream;
  }, [stream]);

  if (shares.length === 0) return null;

  return (
    <section className={`viewer ${expanded ? 'viewer--expanded' : ''}`}>
      <header className="viewer__bar">
        <div className="viewer__tabs">
          {shares.map((share) => (
            <button
              key={share.identity}
              className={`tab ${watching === share.identity ? 'tab--active' : ''}`}
              onClick={() => onWatch(watching === share.identity ? null : share.identity)}
              aria-pressed={watching === share.identity}
            >
              {share.identity === localIdentity ? 'sua tela' : share.identity}
              {share.hasSystemAudio && (
                <span className="tab__audio" title="Com áudio do sistema">
                  ♪
                </span>
              )}
            </button>
          ))}
        </div>

        {watching && (
          <button className="button button--small" onClick={onToggleExpanded}>
            {expanded ? 'Reduzir' : 'Ampliar'}
          </button>
        )}
      </header>

      {watching &&
        (stream ? (
          <>
            <video className="viewer__video" ref={videoRef} autoPlay playsInline muted />
            {watching === localIdentity && (
              <p className="muted viewer__self">
                Prévia local — é isto que os outros recebem. O som não toca aqui.
              </p>
            )}
          </>
        ) : (
          <p className="muted viewer__waiting">
            {watching === localIdentity ? 'Preparando a prévia…' : 'Recebendo a transmissão…'}
          </p>
        ))}
    </section>
  );
}
