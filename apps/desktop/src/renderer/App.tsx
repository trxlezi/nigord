import { useCallback, useEffect, useState } from 'react';
import type { CaptureCapabilities, CaptureSource, ContentKind } from '@nigord/shared';
import {
  ConnectionBadge,
  JoinForm,
  ParticipantList,
  PreferencesPanel,
  SessionControls,
  ShareViewer,
  ServerSettings,
  SourcePicker,
  VolumePanel,
} from '@nigord/ui';
import { bridge } from './bridge.js';
import { useConfig } from './useConfig.js';
import { useDevices } from './useDevices.js';
import { usePreferences } from './usePreferences.js';
import { usePushToTalk } from './usePushToTalk.js';
import { useSession } from './useSession.js';
import './styles.css';

/**
 * The whole interface (task group 7).
 *
 * All session state comes from the core's published view; this component only
 * decides what is on screen and forwards intent. Nothing here knows about
 * LiveKit, and nothing here touches the operating system except through the
 * bridge.
 */
export function App(): JSX.Element {
  const { prefs, loaded, update } = usePreferences();
  const { config, error: configError, save: saveConfig } = useConfig();
  const { view, joining, failure, session, join, leave } = useSession(prefs.inputDeviceId);
  const devices = useDevices();

  const [capabilities, setCapabilities] = useState<CaptureCapabilities | null>(null);
  const [version, setVersion] = useState('');
  const [sources, setSources] = useState<CaptureSource[] | null>(null);
  const [showPrefs, setShowPrefs] = useState(false);
  const [watching, setWatching] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  const persistKey = useCallback(
    (accelerator: string) => update({ pushToTalkKey: accelerator }),
    [update],
  );
  const pushToTalk = usePushToTalk(session, view.micMode, prefs.pushToTalkKey, persistKey);

  useEffect(() => {
    void bridge.invoke('capture:capabilities', {}).then(setCapabilities);
    // Shown in the bar because the README asks for it in a bug report, and
    // nobody can read a version that is not on screen.
    void bridge.invoke('app:version', {}).then(({ version: value }) => setVersion(value));
  }, []);

  // Preferences arrive after the Session was created, so the stored choices have
  // to be adopted once they land. The mode matters most: a session joined in
  // push-to-talk must never start with an open microphone.
  useEffect(() => {
    if (!loaded) return;
    void session.setMicMode(prefs.micMode);
    // Before joining this only records the device; the microphone is published
    // with it on entry, which is what makes the saved choice take effect.
    void session.setInputDevice(prefs.inputDeviceId);
  }, [loaded, session, prefs.micMode, prefs.inputDeviceId]);

  // The output device is applied against the live room, so it can only be set
  // once there is one.
  useEffect(() => {
    if (view.connection !== 'connected') return;
    void session.setOutputDevice(prefs.outputDeviceId);
  }, [session, view.connection, prefs.outputDeviceId]);

  // Volumes are applied to whoever is in the room now: a participant who joins
  // later must still land on the volume this viewer chose for them earlier.
  useEffect(() => {
    for (const participant of view.participants) {
      if (participant.isLocal) continue;
      const silenced = prefs.locallyMuted.includes(participant.identity);
      session.setVoiceVolume(
        participant.identity,
        silenced ? 0 : (prefs.voiceVolumes[participant.identity] ?? 1),
      );
      session.setSystemAudioVolume(
        participant.identity,
        silenced ? 0 : (prefs.systemAudioVolumes[participant.identity] ?? 1),
      );
    }
  }, [
    session,
    view.participants,
    prefs.voiceVolumes,
    prefs.systemAudioVolumes,
    prefs.locallyMuted,
  ]);

  // A share that ends must not leave the viewer staring at a dead video element.
  useEffect(() => {
    if (watching && !view.shares.some((share) => share.identity === watching)) {
      setWatching(null);
      setExpanded(false);
    }
  }, [watching, view.shares]);

  const openPicker = useCallback(async () => {
    setShareError(null);
    const { sources: available } = await bridge.invoke('capture:sources', {});
    setSources(available);
  }, []);

  /**
   * Capture is a two-step handshake: the main process authorises one source,
   * then the renderer acquires the stream it authorised (design.md D2).
   */
  const startSharing = useCallback(
    async (choice: { sourceId: string; contentKind: ContentKind; includeSystemAudio: boolean }) => {
      setSources(null);
      try {
        const granted = await bridge.invoke('capture:start', choice);

        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: granted.systemAudioGranted,
        });

        // The system-audio track is handed over separately so it can be
        // published as its own track with its own volume (design.md D3).
        const [systemAudioTrack] = stream.getAudioTracks();
        await session.startSharing({
          stream,
          contentKind: choice.contentKind,
          systemAudioTrack: systemAudioTrack ?? null,
        });

        update({
          defaultContentKind: choice.contentKind,
          shareSystemAudioByDefault: choice.includeSystemAudio,
        });
      } catch (error) {
        await bridge.invoke('capture:stop', {});
        setShareError(
          error instanceof Error ? error.message : 'Não foi possível iniciar o compartilhamento.',
        );
      }
    },
    [session, update],
  );

  const stopSharing = useCallback(async () => {
    await session.stopSharing();
    await bridge.invoke('capture:stop', {});
  }, [session]);

  const toggleLocalMute = useCallback(
    (identity: string) => {
      const silenced = prefs.locallyMuted.includes(identity);
      update({
        locallyMuted: silenced
          ? prefs.locallyMuted.filter((name) => name !== identity)
          : [...prefs.locallyMuted, identity],
      });
    },
    [prefs.locallyMuted, update],
  );

  // The form stays mounted for the whole attempt. While connecting the state is
  // already 'connecting', so keying this on the connection alone would swap in
  // the empty room UI mid-attempt and then remount the form on failure —
  // throwing away what the participant had typed.
  if (view.connection === 'disconnected' || joining) {
    // Without a server and a secret there is nothing to join, so the settings
    // come first on a fresh install rather than hiding behind a failed attempt.
    const unconfigured = config !== null && (!config.tokenServerUrl || !config.hasSecret);

    return (
      <main className="app app--entry">
        {unconfigured ? (
          <ServerSettings config={config} error={configError} firstRun onSave={saveConfig} />
        ) : (
          <JoinForm
            initialIdentity={prefs.identity}
            initialRoom={prefs.lastRoom}
            busy={joining}
            error={failure?.message ?? null}
            onSubmit={(values) => void join(values)}
          />
        )}
        {view.reason && view.reason !== 'user_left' && (
          <ConnectionBadge state={view.connection} reason={view.reason} />
        )}
      </main>
    );
  }

  return (
    <main className={`app ${expanded ? 'app--expanded' : ''}`}>
      <header className="app__bar">
        <ConnectionBadge state={view.connection} reason={view.reason} />
        <span className="app__spacer" />
        <span className="app__version">{version}</span>
        <button className="button button--small" onClick={() => setShowPrefs(true)}>
          Preferências
        </button>
      </header>

      <div className="app__body">
        <section className="app__stage">
          <ShareViewer
            shares={view.shares}
            watching={watching}
            localIdentity={view.participants.find((p) => p.isLocal)?.identity ?? null}
            expanded={expanded}
            // streamRevision is in the dependency list of this render, so a
            // stream arriving after the share was announced is picked up.
            streamFor={(identity) => session.screenStreamFor(identity)}
            onWatch={setWatching}
            onToggleExpanded={() => setExpanded((current) => !current)}
          />
          {view.shares.length === 0 && (
            <p className="muted app__empty">Ninguém está compartilhando a tela.</p>
          )}
          {shareError && (
            <p className="alert" role="alert">
              {shareError}
            </p>
          )}
        </section>

        <aside className="app__side">
          <ParticipantList
            participants={view.participants}
            shares={view.shares}
            locallyMuted={prefs.locallyMuted}
            onToggleLocalMute={toggleLocalMute}
          />
          <VolumePanel
            participants={view.participants}
            shares={view.shares}
            voiceVolumes={prefs.voiceVolumes}
            systemAudioVolumes={prefs.systemAudioVolumes}
            onVoiceVolume={(identity, volume) =>
              update({ voiceVolumes: { ...prefs.voiceVolumes, [identity]: volume } })
            }
            onSystemAudioVolume={(identity, volume) =>
              update({
                systemAudioVolumes: { ...prefs.systemAudioVolumes, [identity]: volume },
              })
            }
          />
        </aside>
      </div>

      <footer className="app__controls">
        <SessionControls
          micMode={view.micMode}
          transmitting={view.transmitting}
          hasMicrophone={view.hasMicrophone}
          isSharing={view.isSharing}
          canShare={capabilities?.screenCapture.available ?? false}
          onToggleMute={() => {
            const next = view.micMode === 'muted' ? 'open' : 'muted';
            void session.setMicMode(next);
            update({ micMode: next });
          }}
          onTogglePushToTalk={() => {
            const next = view.micMode === 'push-to-talk' ? 'open' : 'push-to-talk';
            void session.setMicMode(next);
            update({ micMode: next });
          }}
          onShare={() => void openPicker()}
          onStopSharing={() => void stopSharing()}
          onLeave={() => void leave()}
        />
      </footer>

      {sources && capabilities && (
        <div className="overlay">
          <SourcePicker
            sources={sources}
            systemAudio={capabilities.systemAudio}
            defaultContentKind={prefs.defaultContentKind}
            defaultIncludeSystemAudio={prefs.shareSystemAudioByDefault}
            onCancel={() => setSources(null)}
            onConfirm={(choice) => void startSharing(choice)}
          />
        </div>
      )}

      {showPrefs && capabilities && (
        <div className="overlay">
          <PreferencesPanel
            inputDevices={devices.inputs}
            outputDevices={devices.outputs}
            inputDeviceId={prefs.inputDeviceId}
            outputDeviceId={prefs.outputDeviceId}
            pushToTalkKey={prefs.pushToTalkKey}
            hotkeys={capabilities.globalHotkeys}
            hotkeyError={pushToTalk.error}
            onInputDevice={(deviceId) => {
              void session.setInputDevice(deviceId);
              update({ inputDeviceId: deviceId });
            }}
            onOutputDevice={(deviceId) => {
              void session.setOutputDevice(deviceId);
              update({ outputDeviceId: deviceId });
            }}
            onPushToTalkKey={(accelerator) => void pushToTalk.rebind(accelerator)}
            onClose={() => setShowPrefs(false)}
          >
            {config && <ServerSettings config={config} error={configError} onSave={saveConfig} />}
          </PreferencesPanel>
        </div>
      )}
    </main>
  );
}
