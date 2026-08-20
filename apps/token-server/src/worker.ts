import { handleRequest } from './app.js';
import type { Env } from './config.js';

/**
 * Entry point Cloudflare calls (task 9.6).
 *
 * There is no listen, no port and no signal handling: the platform owns the
 * lifecycle. Everything this service does lives in app.ts, which takes a
 * Request and returns a Response — testable without a runtime.
 */
export default {
  fetch: handleRequest,
} satisfies ExportedHandler<Env>;
