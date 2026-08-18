import type { NigordBridge } from '@nigord/shared';

declare global {
  interface Window {
    nigord: NigordBridge;
  }
}

/**
 * The renderer's only door to the main process. Everything platform-specific
 * arrives through here, already validated on both sides.
 */
export const bridge: NigordBridge = window.nigord;
