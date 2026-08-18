import { z } from 'zod';

/**
 * Contract between the desktop app and the token server.
 * Defined once here and validated on both ends — the client validates what it
 * sends, the server validates what it receives, and neither can drift.
 */

export const roomNameSchema = z
  .string()
  .trim()
  .min(1, 'Room name is required')
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'Room name must be lowercase alphanumeric with dashes');

export const participantIdentitySchema = z
  .string()
  .trim()
  .min(1, 'Identity is required')
  .max(32)
  .regex(/^[\w][\w .-]*$/u, 'Identity contains unsupported characters');

export const tokenRequestSchema = z.object({
  room: roomNameSchema,
  identity: participantIdentitySchema,
});

export const tokenResponseSchema = z.object({
  token: z.string().min(1),
  url: z.string().url(),
  /** Unix seconds. The client uses this to refresh before the token dies. */
  expiresAt: z.number().int().positive(),
});

/** Error codes the client distinguishes in the UI. See specs/voice-session. */
export const tokenErrorCodeSchema = z.enum([
  'invalid_request',
  'unauthorized',
  'rate_limited',
  'server_error',
]);

export const tokenErrorSchema = z.object({
  code: tokenErrorCodeSchema,
  message: z.string(),
  /** Seconds until the client may retry. Only set for rate_limited. */
  retryAfter: z.number().int().nonnegative().optional(),
});

export type TokenRequest = z.infer<typeof tokenRequestSchema>;
export type TokenResponse = z.infer<typeof tokenResponseSchema>;
export type TokenErrorCode = z.infer<typeof tokenErrorCodeSchema>;
export type TokenError = z.infer<typeof tokenErrorSchema>;

/** Header carrying the group shared secret. */
export const GROUP_SECRET_HEADER = 'x-nigord-secret';

/**
 * How a token request failed, from the client's point of view: the server's own
 * codes plus `unreachable`, which no server can report about itself.
 */
export type TokenFailureCode = TokenErrorCode | 'unreachable';

/**
 * Failures cross the IPC boundary as Error messages — structured errors do not
 * survive the serialisation — so the code travels as a machine-readable prefix.
 *
 * This exists because classifying failures by matching their prose is fragile:
 * the channel name `token:request` appears in Electron's own IPC error text,
 * which made an unreachable server look like a rejected credential.
 */
const TOKEN_FAILURE_PREFIX = 'nigord-token-failure';

export const encodeTokenFailure = (code: TokenFailureCode, message: string): string =>
  `${TOKEN_FAILURE_PREFIX}/${code} ${message}`;

/** Recovers the code from an error message, wherever the prefix appears in it. */
export const decodeTokenFailure = (
  text: string,
): { code: TokenFailureCode; message: string } | null => {
  const match = new RegExp(`${TOKEN_FAILURE_PREFIX}/([a-z_]+) ?([\\s\\S]*)`).exec(text);
  if (!match) return null;

  const [, code, message = ''] = match;
  const known = tokenErrorCodeSchema.safeParse(code);
  if (known.success) return { code: known.data, message };
  return code === 'unreachable' ? { code: 'unreachable', message } : null;
};
