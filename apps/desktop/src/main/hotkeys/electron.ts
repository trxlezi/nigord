import { globalShortcut } from 'electron';
import type { HotkeyProvider, HotkeyRegistration } from './types.js';

/**
 * Global hotkeys via Electron's globalShortcut (tasks 5.2, 8.x).
 *
 * Electron only reports key presses, not releases, so push-to-talk is
 * synthesised: the first press opens the mic and a silence timer closes it,
 * refreshed by the auto-repeat that holding the key produces. It is the only
 * approach available without a native input hook, and it is why task 1.3 has
 * to be validated against real games before this is trusted.
 */
const RELEASE_GRACE_MS = 180;

export class ElectronHotkeyProvider implements HotkeyProvider {
  private current: string | null = null;
  private releaseTimer: ReturnType<typeof setTimeout> | null = null;
  private isDown = false;

  available(): { available: boolean; reason: string | null } {
    return { available: true, reason: null };
  }

  register(
    accelerator: string,
    handlers: { onDown: () => void; onUp: () => void },
  ): HotkeyRegistration {
    if (globalShortcut.isRegistered(accelerator) && accelerator !== this.current) {
      return {
        ok: false,
        reason: `"${accelerator}" is already registered by another application.`,
      };
    }

    const previous = this.current;
    if (previous) globalShortcut.unregister(previous);

    const registered = globalShortcut.register(accelerator, () => {
      if (!this.isDown) {
        this.isDown = true;
        handlers.onDown();
      }
      if (this.releaseTimer) clearTimeout(this.releaseTimer);
      this.releaseTimer = setTimeout(() => {
        this.isDown = false;
        this.releaseTimer = null;
        handlers.onUp();
      }, RELEASE_GRACE_MS);
    });

    if (!registered) {
      // specs/voice-session: a rejected key must leave the previous one in force.
      if (previous) globalShortcut.register(previous, () => undefined);
      return { ok: false, reason: `"${accelerator}" could not be registered.` };
    }

    this.current = accelerator;
    return { ok: true, reason: null };
  }

  unregisterAll(): void {
    if (this.releaseTimer) {
      clearTimeout(this.releaseTimer);
      this.releaseTimer = null;
    }
    this.isDown = false;
    this.current = null;
    globalShortcut.unregisterAll();
  }
}
