import type { Participant, ScreenShare } from '@nigord/shared';

export interface VolumePanelProps {
  participants: readonly Participant[];
  shares: readonly ScreenShare[];
  voiceVolumes: Readonly<Record<string, number>>;
  systemAudioVolumes: Readonly<Record<string, number>>;
  onVoiceVolume: (identity: string, volume: number) => void;
  onSystemAudioVolume: (identity: string, volume: number) => void;
}

/**
 * Independent volumes per participant (task 7.6).
 *
 * Voice and system audio are separate sliders because they are separate tracks
 * (design.md D3) — turning the game down without turning the friend down is
 * the whole reason for that split.
 */
export function VolumePanel({
  participants,
  shares,
  voiceVolumes,
  systemAudioVolumes,
  onVoiceVolume,
  onSystemAudioVolume,
}: VolumePanelProps): JSX.Element {
  const remote = participants.filter((participant) => !participant.isLocal);
  const sharing = new Set(shares.filter((share) => share.hasSystemAudio).map((s) => s.identity));

  return (
    <section className="volumes">
      <h3 className="volumes__title">Volumes</h3>

      {remote.length === 0 && <p className="muted">Ninguém mais na sala.</p>}

      {remote.map((participant) => (
        <div className="volumes__row" key={participant.identity}>
          <span className="volumes__name">{participant.identity}</span>

          <Slider
            label="voz"
            value={voiceVolumes[participant.identity] ?? 1}
            onChange={(value) => onVoiceVolume(participant.identity, value)}
          />

          {sharing.has(participant.identity) && (
            <Slider
              label="tela"
              value={systemAudioVolumes[participant.identity] ?? 1}
              onChange={(value) => onSystemAudioVolume(participant.identity, value)}
            />
          )}
        </div>
      ))}
    </section>
  );
}

function Slider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}): JSX.Element {
  return (
    <label className="slider">
      <span className="slider__label">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(value * 100)}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
        aria-label={`Volume da ${label}`}
      />
    </label>
  );
}
