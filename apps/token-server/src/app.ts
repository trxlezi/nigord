import { timingSafeEqual } from 'node:crypto';
import rateLimit from '@fastify/rate-limit';
import {
  GROUP_SECRET_HEADER,
  type TokenError,
  type TokenResponse,
  tokenRequestSchema,
} from '@nigord/shared';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { AccessToken } from 'livekit-server-sdk';
import type { Config } from './config.js';

/**
 * Compares without leaking length or content through timing. Overkill for six
 * friends, cheap enough to be worth doing correctly.
 */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function errorBody(code: TokenError['code'], message: string, retryAfter?: number): TokenError {
  return retryAfter === undefined ? { code, message } : { code, message, retryAfter };
}

/** Type guard so the error handler can pass our own shape through untouched. */
function isTokenError(value: unknown): value is TokenError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    typeof (value as { code: unknown }).code === 'string'
  );
}

export async function buildApp(config: Config): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: process.env['LOG_LEVEL'] ?? 'info' } });

  await app.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindow,
    // The plugin throws whatever this returns, and Fastify's error path reads
    // statusCode off it. Without statusCode a rate-limited request surfaces as
    // a 500, which would tell the client to retry instead of to back off.
    errorResponseBuilder: (_req, context) =>
      Object.assign(
        errorBody(
          'rate_limited',
          `Too many requests. Retry in ${context.after}.`,
          Math.ceil(context.ttl / 1000),
        ),
        { statusCode: 429 },
      ),
  });

  // Keep the TokenError contract intact on the way out: Fastify's default
  // serializer would replace `code` and `retryAfter` with its own fields.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = error.statusCode ?? 500;
    if (isTokenError(error)) {
      const { code, message, retryAfter } = error;
      return reply.code(statusCode).send(errorBody(code, message, retryAfter));
    }
    request.log.error({ error }, 'Unhandled error');
    return reply.code(statusCode).send(errorBody('server_error', 'Unexpected error.'));
  });

  app.get('/health', async () => ({ ok: true }));

  app.post('/token', async (request, reply) => {
    const provided = request.headers[GROUP_SECRET_HEADER];
    if (typeof provided !== 'string' || !secretMatches(provided, config.groupSecret)) {
      // Deliberately vague: a caller without the secret learns nothing about
      // whether the room or identity would have been valid.
      return reply.code(401).send(errorBody('unauthorized', 'Invalid or missing group secret.'));
    }

    const parsed = tokenRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      return reply.code(400).send(errorBody('invalid_request', detail));
    }

    const { room, identity } = parsed.data;

    try {
      const at = new AccessToken(config.livekitApiKey, config.livekitApiSecret, {
        identity,
        ttl: config.tokenTtlSeconds,
      });
      // Scoped to this room only — a token issued for one room cannot be
      // replayed against another. See specs/room-access.
      at.addGrant({
        room,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: false,
      });

      const body: TokenResponse = {
        token: await at.toJwt(),
        url: config.livekitUrl,
        expiresAt: Math.floor(Date.now() / 1000) + config.tokenTtlSeconds,
      };
      return reply.code(200).send(body);
    } catch (error) {
      request.log.error({ error }, 'Failed to mint access token');
      return reply.code(500).send(errorBody('server_error', 'Could not issue a token.'));
    }
  });

  return app;
}
