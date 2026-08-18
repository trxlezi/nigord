import { ElectronHotkeyProvider } from './electron.js';
import type { HotkeyProvider } from './types.js';

export function createHotkeyProvider(): HotkeyProvider {
  return new ElectronHotkeyProvider();
}

export type { HotkeyProvider, HotkeyRegistration } from './types.js';
