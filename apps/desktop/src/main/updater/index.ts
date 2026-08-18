import type { BrowserWindow } from 'electron';
import electronUpdater from 'electron-updater';

/**
 * Auto-update against GitHub Releases (task 9.4, design.md D7).
 *
 * With six testers, divergent versions make any bug report ambiguous — this is
 * what keeps the third validation ring usable.
 *
 * A failed check must never block startup (specs/desktop-shell): an offline
 * participant still gets to talk.
 */
export function initUpdater(window: BrowserWindow): void {
  const { autoUpdater } = electronUpdater;

  autoUpdater.autoDownload = true;
  // The participant decides when to restart — a forced restart mid-game would
  // be worse than running one version behind for an hour.
  autoUpdater.autoInstallOnAppQuit = true;

  const send = (channel: string, payload: unknown): void => {
    if (!window.isDestroyed()) window.webContents.send(channel, payload);
  };

  autoUpdater.on('update-available', (info) => send('update:available', { version: info.version }));
  autoUpdater.on('update-downloaded', (info) =>
    send('update:downloaded', { version: info.version }),
  );
  autoUpdater.on('error', (error) => send('update:error', { message: error.message }));

  void autoUpdater.checkForUpdates().catch(() => {
    // Offline, or no release published yet. Both are normal.
  });
}

export function quitAndInstall(): void {
  electronUpdater.autoUpdater.quitAndInstall();
}
