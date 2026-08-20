import { timingSafeEqual } from 'node:crypto';
import {
  GROUP_SECRET_HEADER,
  type TokenError,
  type TokenResponse,
  tokenRequestSchema,
} from '@nigord/shared';
import { AccessToken } from 'livekit-server-sdk';
import { ConfigError, type Env, loadConfig } from './config.js';

/**
 * How long the rate limit window is, in seconds. It has to match the `period`
 * in wrangler.jsonc: Cloudflare's binding answers only `success`, never how
 * long the caller must wait, so the window length is the honest upper bound to
 * report as `retryAfter`.
 */
const RATE_LIMIT_WINDOW_SECONDS = 60;

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

function fail(
  status: number,
  code: TokenError['code'],
  message: string,
  retryAfter?: number,
): Response {
  const body: TokenError =
    retryAfter === undefined ? { code, message } : { code, message, retryAfter };
  return Response.json(body, { status });
}

/**
 * Who the rate limit counts against.
 *
 * `CF-Connecting-IP` is written by Cloudflare's edge and overwrites whatever
 * the caller sent, so unlike `X-Forwarded-For` behind an arbitrary proxy it
 * cannot be forged to claim a fresh address each attempt. This is what retired
 * the TRUST_PROXY setting: on Fly every request arrived from the platform
 * router and the whole group shared one budget unless the hop count was
 * configured. Here each participant is counted separately by construction.
 */
function callerKey(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? 'unknown';
}

/**
 * The whole service: one route that signs a room credential, and a health
 * check that answers without one.
 */
export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === '/health' && request.method === 'GET') {
    return Response.json({ ok: true });
  }

  if (url.pathname !== '/token') {
    return fail(404, 'invalid_request', 'Not found.');
  }
  if (request.method !== 'POST') {
    return fail(400, 'invalid_request', 'Use POST.');
  }

  // Before anything else, and before any token could be minted: a Worker with
  // missing credentials must say so, not sign something the media service will
  // reject (see config.ts).
  let config;
  try {
    config = loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`nigord token-server is misconfigured:\n${error.message}`);
      return fail(500, 'server_error', 'Service is not configured.');
    }
    throw error;
  }

  const provided = request.headers.get(GROUP_SECRET_HEADER);
  if (provided === null || !secretMatches(provided, config.groupSecret)) {
    // Deliberately vague: a caller without the secret learns nothing about
    // whether the room or identity would have been valid.
    return fail(401, 'unauthorized', 'Invalid or missing group secret.');
  }

  // Counted only after the secret checks out, so a stranger hammering the
  // endpoint cannot spend the budget of the participant sharing their address.
  const { success } = await env.RATE_LIMITER.limit({ key: callerKey(request) });
  if (!success) {
    return fail(
      429,
      'rate_limited',
      `Too many requests. Retry in ${RATE_LIMIT_WINDOW_SECONDS} seconds.`,
      RATE_LIMIT_WINDOW_SECONDS,
    );
  }

  const payload: unknown = await request.json().catch(() => null);
  const parsed = tokenRequestSchema.safeParse(payload);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    return fail(400, 'invalid_request', detail);
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
      // Chat rides the room's own data channel, so this is all the server
      // does for it: no message ever reaches this service, and none is
      // stored anywhere.
      canPublishData: true,
    });

    const body: TokenResponse = {
      token: await at.toJwt(),
      url: config.livekitUrl,
      expiresAt: Math.floor(Date.now() / 1000) + config.tokenTtlSeconds,
    };
    return Response.json(body);
  } catch (error) {
    console.error('Failed to mint access token', error);
    return fail(500, 'server_error', 'Could not issue a token.');
  }
}
