import { z } from 'zod';

/**
 * Configuration is validated at boot, not at request time.
 *
 * specs/room-access requires that a server started without credentials fails
 * loudly rather than accepting requests and issuing tokens the media service
 * will reject. A misconfigured server that looks healthy is worse than one
 * that refuses to start.
 */
const configSchema = z.object({
  livekitUrl: z.string().url('LIVEKIT_URL must be a valid URL'),
  livekitApiKey: z.string().min(1, 'LIVEKIT_API_KEY is required'),
  livekitApiSecret: z.string().min(1, 'LIVEKIT_API_SECRET is required'),
  groupSecret: z.string().min(8, 'NIGORD_GROUP_SECRET must be at least 8 characters'),
  port: z.coerce.number().int().min(1).max(65535).default(3000),
  host: z.string().default('0.0.0.0'),
  tokenTtlSeconds: z.coerce.number().int().min(60).max(3600).default(600),
  rateLimitMax: z.coerce.number().int().positive().default(20),
  rateLimitWindow: z.string().default('1 minute'),
  /**
   * How many proxy hops sit in front of this service, or a list of proxy
   * addresses to trust.
   *
   * This decides what the rate limiter counts. Behind a tunnel or a platform
   * router, every request arrives from the same address, so without this the
   * limit becomes a single shared budget for the whole group — one participant
   * reconnecting could lock everyone else out.
   *
   * It defaults to trusting nothing, because trusting a forwarded header that
   * nobody set lets any caller claim a fresh address and slip the limit
   * entirely. Set it to the real number of hops when deploying.
   */
  trustProxy: z
    .union([z.literal(false), z.coerce.number().int().positive(), z.string().min(1)])
    .default(false),
});

export type Config = z.infer<typeof configSchema>;

/**
 * TRUST_PROXY accepts a hop count ("1"), an explicit list of proxy addresses,
 * or nothing at all. "false"/"0"/empty all mean trust nothing.
 */
function parseTrustProxy(raw: string | undefined): false | number | string {
  if (!raw || raw === 'false' || raw === '0') return false;
  const hops = Number(raw);
  return Number.isInteger(hops) && hops > 0 ? hops : raw;
}

export class ConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid configuration:\n  - ${issues.join('\n  - ')}`);
    this.name = 'ConfigError';
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = configSchema.safeParse({
    livekitUrl: env['LIVEKIT_URL'],
    livekitApiKey: env['LIVEKIT_API_KEY'],
    livekitApiSecret: env['LIVEKIT_API_SECRET'],
    groupSecret: env['NIGORD_GROUP_SECRET'],
    port: env['PORT'],
    host: env['HOST'],
    tokenTtlSeconds: env['TOKEN_TTL_SECONDS'],
    rateLimitMax: env['RATE_LIMIT_MAX'],
    rateLimitWindow: env['RATE_LIMIT_WINDOW'],
    trustProxy: parseTrustProxy(env['TRUST_PROXY']),
  });

  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }
  return result.data;
}
