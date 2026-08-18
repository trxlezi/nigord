import type { CaptureProvider } from './types.js';
import { StubCaptureProvider } from './stub.js';

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
      // Task 5.3, gated on the spike in task 1. Until the loopback behaviour
      // is confirmed on real hardware, Windows deliberately gets the honest
      // stub rather than an untested implementation.
      return new StubCaptureProvider();
    default:
      return new StubCaptureProvider();
  }
}

export type { CaptureProvider } from './types.js';
