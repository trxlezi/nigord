import { z } from 'zod';

/**
 * Configuration, validated before a single token is signed.
 *
 * specs/room-access requires that a service without credentials fails loudly
 * rather than issuing tokens the media service will reject. On Fastify that was
 * a boot check. A Worker has no boot: there is no long-lived process to refuse
 * to start, and an isolate is created on demand. So the check moved to the
 * request path — every request validates before doing anything, and a
 * misconfigured Worker answers `server_error` on all of them.
 *
 * The guarantee is the same one, kept in the only place a Worker can keep it:
 * a bad configuration never produces a token, it produces an error.
 */
const configSchema = z.object({
  livekitUrl: z.string().url('LIVEKIT_URL must be a valid URL'),
  livekitApiKey: z.string().min(1, 'LIVEKIT_API_KEY is required'),
  livekitApiSecret: z.string().min(1, 'LIVEKIT_API_SECRET is required'),
  groupSecret: z.string().min(8, 'NIGORD_GROUP_SECRET must be at least 8 characters'),
  tokenTtlSeconds: z.coerce.number().int().min(60).max(3600).default(600),
});

export type Config = z.infer<typeof configSchema>;

/**
 * What Cloudflare binds into the Worker.
 *
 * The three LiveKit values and the group secret are Worker *secrets*, set with
 * `wrangler secret put` and never present in the repository. LIVEKIT_URL is a
 * plain var — it is not a credential, and having it in wrangler.jsonc makes the
 * deployment self-describing.
 */
export interface Env {
  LIVEKIT_URL: string;
  LIVEKIT_API_KEY: string;
  LIVEKIT_API_SECRET: string;
  NIGORD_GROUP_SECRET: string;
  TOKEN_TTL_SECONDS?: string;
  RATE_LIMITER: RateLimiter;
}

/**
 * The slice of Cloudflare's rate limiting binding this service uses.
 *
 * Declared here rather than imported so the tests can supply a fake without
 * pulling in the Workers runtime types.
 */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export class ConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid configuration:\n  - ${issues.join('\n  - ')}`);
    this.name = 'ConfigError';
  }
}

/**
 * Takes the bindings loosely typed on purpose: what Cloudflare hands over is
 * whatever was configured, and a missing secret arrives as undefined however
 * `Env` describes it. Narrowing is this function's job, not its caller's.
 */
export function loadConfig(env: Partial<Record<keyof Env, unknown>>): Config {
  const result = configSchema.safeParse({
    livekitUrl: env.LIVEKIT_URL,
    livekitApiKey: env.LIVEKIT_API_KEY,
    livekitApiSecret: env.LIVEKIT_API_SECRET,
    groupSecret: env.NIGORD_GROUP_SECRET,
    tokenTtlSeconds: env.TOKEN_TTL_SECONDS,
  });

  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }
  return result.data;
}
