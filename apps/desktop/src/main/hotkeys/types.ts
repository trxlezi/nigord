/**
 * The other half of the platform boundary (design.md D2).
 *
 * Global hotkeys are the feature that most clearly justifies a desktop app
 * over a web page, and the one the Linux development machine cannot exercise
 * against a fullscreen game.
 */
export interface HotkeyRegistration {
  ok: boolean;
  /** Populated when ok is false — a conflict, or an unsupported platform. */
  reason: string | null;
}

export interface HotkeyProvider {
  available(): { available: boolean; reason: string | null };

  /**
   * Registers the push-to-talk key, replacing any previous registration.
   *
   * On failure the previous registration must remain in force:
   * specs/voice-session requires that a rejected key leaves the participant
   * with the shortcut they had, not with none.
   */
  register(
    accelerator: string,
    handlers: { onDown: () => void; onUp: () => void },
  ): HotkeyRegistration;

  unregisterAll(): void;
}
