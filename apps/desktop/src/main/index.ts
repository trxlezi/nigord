import { join } from 'node:path';
import { BrowserWindow, Menu, Tray, app, nativeImage, session, shell } from 'electron';
import { createCaptureProvider } from './capture/index.js';
import { createHotkeyProvider } from './hotkeys/index.js';
import { registerIpc } from './ipc/register.js';
import { ConfigStore } from './config/store.js';
import { PreferencesStore } from './prefs/store.js';
import { TokenClient } from './tokenClient.js';
import { initUpdater } from './updater/index.js';

const capture = createCaptureProvider();
const hotkeys = createHotkeyProvider();

let window: BrowserWindow | null = null;
let tray: Tray | null = null;
let prefs: PreferencesStore;
let config: ConfigStore;
let quitting = false;

/**
 * Single instance (task 6.5). A second launch must surface the running session
 * rather than start a rival one that would fight it for the microphone.
 */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  });

  void app.whenReady().then(main);
}

async function main(): Promise<void> {
  prefs = new PreferencesStore(app.getPath('userData'));
  config = new ConfigStore(app.getPath('userData'));

  createWindow();
  createTray();
  wireIpc();
  wireDisplayMedia();

  if (window) initUpdater(window);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else window?.show();
  });
}

function createWindow(): void {
  window = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 860,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f1115',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      // design.md D5. Retrofitting isolation later is painful; it costs nothing
      // to adopt from the first commit.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
    },
  });

  window.once('ready-to-show', () => window?.show());

  /**
   * Closing the window keeps the session alive in the tray
   * (specs/desktop-shell). Only an explicit quit ends it.
   */
  window.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    window?.hide();
  });

  // External links open in the real browser, never inside the app shell.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== window?.webContents.getURL()) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  const devServer = process.env['ELECTRON_RENDERER_URL'];
  if (devServer) void window.loadURL(devServer);
  else void window.loadFile(join(import.meta.dirname, '../renderer/index.html'));
}

function createTray(): void {
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip('Nigord');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir Nigord', click: () => window?.show() },
      { type: 'separator' },
      { label: 'Sair', click: () => quit() },
    ]),
  );
  tray.on('click', () => (window?.isVisible() ? window.hide() : window?.show()));
}

/**
 * The renderer calls getDisplayMedia; this handler is where the main process
 * decides which source it gets and whether system audio comes with it. On
 * Windows the provider requests loopback here — the one place in the app that
 * knows how that works.
 */
function wireDisplayMedia(): void {
  session.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      void (async () => {
        // The renderer chose a source through capture:start before calling
        // getDisplayMedia. A request without an authorisation is denied rather
        // than answered with an arbitrary screen.
        const authorised = capture.pendingAuthorisation();
        if (!authorised) {
          callback({});
          return;
        }

        const sources = await capture.listSources();
        const chosen = sources.find((source) => source.id === authorised.sourceId);
        if (!chosen) {
          callback({});
          return;
        }

        callback({
          video: { id: chosen.id, name: chosen.name } as never,
          ...(authorised.loopbackAudio ? { audio: 'loopback' as never } : {}),
        });
      })();
    },
    { useSystemPicker: false },
  );
}

function wireIpc(): void {
  const tokenClient = new TokenClient(() => ({
    baseUrl: config.tokenServerUrl,
    groupSecret: config.groupSecret,
  }));

  registerIpc({
    // Each capability is reported by the provider that implements it. Hotkeys
    // belong to the HotkeyProvider, not to capture — reading them off the
    // capture stub disabled the key picker on Windows, where the real hotkey
    // provider works fine.
    'capture:capabilities': () => ({
      ...capture.capabilities(),
      globalHotkeys: hotkeys.available(),
    }),
    'capture:sources': async () => ({ sources: await capture.listSources() }),
    'capture:start': (payload) =>
      capture.beginCapture({
        sourceId: payload.sourceId,
        includeSystemAudio: payload.includeSystemAudio,
      }),
    'capture:stop': () => {
      capture.endCapture();
      return {};
    },
    'hotkey:register': (payload) =>
      hotkeys.register(payload.accelerator, {
        onDown: () => window?.webContents.send('hotkey:down', {}),
        onUp: () => window?.webContents.send('hotkey:up', {}),
      }),
    'hotkey:unregister': () => {
      hotkeys.unregisterAll();
      return {};
    },
    'prefs:get': () => prefs.get(),
    'prefs:set': (patch) => prefs.update(patch),
    // The secret goes in and never comes back out: the response carries only
    // whether one is stored.
    'config:get': () => config.view,
    'config:set': (patch) => config.update(patch),
    'token:request': (payload) => tokenClient.request(payload.room, payload.identity),
    'app:quit': () => {
      quit();
      return {};
    },
    'app:version': () => ({ version: app.getVersion() }),
  });
}

function quit(): void {
  quitting = true;
  app.quit();
}

// Releasing shortcuts is required (specs/desktop-shell) — an abandoned global
// shortcut would keep swallowing the key for every other application.
app.on('will-quit', () => {
  hotkeys.unregisterAll();
  capture.endCapture();
});

app.on('window-all-closed', () => {
  // Deliberately empty: the tray keeps the session alive. Quitting is explicit.
});
