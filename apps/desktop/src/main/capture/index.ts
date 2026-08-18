import type { CaptureProvider } from './types.js';
import { StubCaptureProvider } from './stub.js';
import { WindowsCaptureProvider } from './windows.js';

/**
 * The single point where the platform is decided (task 5.5).
 *
 * Nothing above this line branches on process.platform. Adding the Windows
 * provider is a change to this function and nowhere else.
 */
export function createCaptureProvider(
  platform: NodeJS.Platform = process.platform,
): CaptureProvider {
  switch (platform) {
    case 'win32':
      return new WindowsCaptureProvider();
    default:
      return new StubCaptureProvider();
  }
}

export type { CaptureProvider } from './types.js';
