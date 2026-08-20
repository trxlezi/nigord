import { GROUP_SECRET_HEADER } from '@nigord/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleRequest } from './app.js';
import type { Env, RateLimiter } from './config.js';

const GROUP_SECRET = 'group-secret-value';
const LIMIT = 3;

/**
 * Stands in for Cloudflare's binding, which is not available outside workerd.
 * It only has to answer the one question the service asks — is this caller
 * still within their budget — and to keep separate budgets per key, which is
 * the property the address handling exists to preserve.
 */
function fakeRateLimiter(limit = LIMIT): RateLimiter {
  const seen = new Map<string, number>();
  return {
    limit: ({ key }) => {
      const count = (seen.get(key) ?? 0) + 1;
      seen.set(key, count);
      return Promise.resolve({ success: count <= limit });
    },
  };
}

let env: Env;

beforeEach(() => {
  env = {
    LIVEKIT_URL: 'wss://example.livekit.cloud',
    LIVEKIT_API_KEY: 'APIkey',
    LIVEKIT_API_SECRET: 'a-secret-long-enough-for-signing',
    NIGORD_GROUP_SECRET: GROUP_SECRET,
    RATE_LIMITER: fakeRateLimiter(),
  };
});

const post = (
  body: unknown,
  { secret = GROUP_SECRET, ip = '1.1.1.1' }: { secret?: string | null; ip?: string } = {},
): Promise<Response> => {
  const headers = new Headers({ 'content-type': 'application/json', 'CF-Connecting-IP': ip });
  if (secret !== null) headers.set(GROUP_SECRET_HEADER, secret);
  return handleRequest(
    new Request('https://nigord-token.workers.dev/token', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
    env,
  );
};

/** The fields of the response and of the JWT that these tests assert on. */
interface Body {
  token: string;
  url: string;
  expiresAt: number;
  code: string;
  retryAfter: number;
  ok: boolean;
}

interface Claims {
  sub: string;
  exp: number;
  nbf: number;
  video: { room: string; roomJoin: boolean; roomCreate?: boolean };
}

const bodyOf = async (res: Response): Promise<Body> => (await res.json()) as Body;

const claimsOf = (token: string): Claims => {
  const [, payload] = token.split('.');
  return JSON.parse(Buffer.from(payload as string, 'base64url').toString()) as Claims;
};

describe('POST /token', () => {
  it('issues a token for a valid request', async () => {
    // specs/room-access: "Solicitação válida"
    const res = await post({ room: 'sala-principal', identity: 'trxlezi' });
    expect(res.status).toBe(200);

    const body = await bodyOf(res);
    expect(body.url).toBe(env.LIVEKIT_URL);
    expect(typeof body.token).toBe('string');
    expect(body.token.split('.')).toHaveLength(3);
    expect(body.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('scopes the token to the requested room and identity', async () => {
    const res = await post({ room: 'sala-principal', identity: 'trxlezi' });
    const claims = claimsOf((await bodyOf(res)).token);

    expect(claims.sub).toBe('trxlezi');
    expect(claims.video.room).toBe('sala-principal');
    expect(claims.video.roomJoin).toBe(true);
    // The token must not be usable as a wildcard across rooms.
    expect(claims.video.roomCreate).toBeFalsy();
  });

  it('gives the token a bounded lifetime', async () => {
    const res = await post({ room: 'sala-principal', identity: 'trxlezi' });
    const claims = claimsOf((await bodyOf(res)).token);

    // specs/room-access: "Validade limitada da credencial"
    expect(claims.exp - claims.nbf).toBeLessThanOrEqual(600);
  });

  it('rejects a request with no group secret', async () => {
    // specs/room-access: "Solicitante sem o segredo"
    const res = await post({ room: 'sala-principal', identity: 'trxlezi' }, { secret: null });
    expect(res.status).toBe(401);
    expect((await bodyOf(res)).code).toBe('unauthorized');
  });

  it('rejects a request with the wrong group secret', async () => {
    const res = await post(
      { room: 'sala-principal', identity: 'trxlezi' },
      { secret: 'wrong-secret-value' },
    );
    expect(res.status).toBe(401);
    expect((await bodyOf(res)).code).toBe('unauthorized');
  });

  it('rejects a missing room', async () => {
    // specs/room-access: "Sala ou identidade ausente"
    const res = await post({ identity: 'trxlezi' });
    expect(res.status).toBe(400);
    expect((await bodyOf(res)).code).toBe('invalid_request');
  });

  it('rejects a missing identity', async () => {
    const res = await post({ room: 'sala-principal' });
    expect(res.status).toBe(400);
    expect((await bodyOf(res)).code).toBe('invalid_request');
  });

  it('rejects a room name that is not url-safe', async () => {
    const res = await post({ room: 'Sala Principal', identity: 'trxlezi' });
    expect(res.status).toBe(400);
  });

  it('rejects a body that is not JSON', async () => {
    const res = await handleRequest(
      new Request('https://nigord-token.workers.dev/token', {
        method: 'POST',
        headers: { [GROUP_SECRET_HEADER]: GROUP_SECRET, 'CF-Connecting-IP': '1.1.1.1' },
        body: 'not json at all',
      }),
      env,
    );
    expect(res.status).toBe(400);
    expect((await bodyOf(res)).code).toBe('invalid_request');
  });

  it('distinguishes a bad secret from a bad payload', async () => {
    // The UI needs to tell the participant which thing to fix.
    const badSecret = await post(
      { room: 'sala-principal', identity: 'trxlezi' },
      { secret: 'nope-nope-nope' },
    );
    const badPayload = await post({ room: '', identity: '' });
    expect((await bodyOf(badSecret)).code).not.toBe((await bodyOf(badPayload)).code);
  });

  it('answers server_error, never a token, when the credentials are missing', async () => {
    // specs/room-access: "Configuração ausente no serviço". A Worker cannot
    // refuse to boot, so the guarantee is kept per request instead.
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      env = { ...env, LIVEKIT_API_SECRET: '' };
      const res = await post({ room: 'sala-principal', identity: 'trxlezi' });
      expect(res.status).toBe(500);
      expect((await bodyOf(res)).code).toBe('server_error');
    } finally {
      silence.mockRestore();
    }
  });
});

describe('rate limiting', () => {
  const body = { room: 'sala-principal', identity: 'trxlezi' };

  it('limits a caller that exceeds the window', async () => {
    // specs/room-access: "Excesso de solicitações"
    for (let i = 0; i < LIMIT; i += 1) {
      expect((await post(body)).status).toBe(200);
    }

    const limited = await post(body);
    expect(limited.status).toBe(429);

    const json = await bodyOf(limited);
    expect(json.code).toBe('rate_limited');
    expect(json.retryAfter).toBeGreaterThan(0);
  });

  it('gives each participant their own budget', async () => {
    // On Fly every request arrived from the platform router, so the limit was
    // one budget shared by the whole group unless the hop count was configured.
    // CF-Connecting-IP is written by the edge, so this now holds by default.
    for (let i = 0; i < LIMIT; i += 1) await post(body, { ip: '1.1.1.1' });
    expect((await post(body, { ip: '1.1.1.1' })).status).toBe(429);

    // Someone who has not spent their own budget still gets through.
    expect((await post(body, { ip: '2.2.2.2' })).status).toBe(200);
  });

  it('does not spend a budget on a caller without the secret', async () => {
    // A stranger hammering the endpoint must not lock out the participant who
    // happens to share their address.
    for (let i = 0; i < LIMIT * 2; i += 1) {
      await post(body, { secret: 'wrong-secret-value', ip: '3.3.3.3' });
    }
    expect((await post(body, { ip: '3.3.3.3' })).status).toBe(200);
  });
});

describe('GET /health', () => {
  it('answers without a secret', async () => {
    const res = await handleRequest(
      new Request('https://nigord-token.workers.dev/health'),
      // Deliberately unconfigured: the health check must answer even then, or
      // the platform would report the Worker as down for a fixable reason.
      {} as Env,
    );
    expect(res.status).toBe(200);
    expect((await bodyOf(res)).ok).toBe(true);
  });

  it('does not answer on an unknown path', async () => {
    const res = await handleRequest(new Request('https://nigord-token.workers.dev/'), env);
    expect(res.status).toBe(404);
  });
});
