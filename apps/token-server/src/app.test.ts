import { GROUP_SECRET_HEADER } from '@nigord/shared';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import type { Config } from './config.js';

process.env['LOG_LEVEL'] = 'silent';

const config: Config = {
  livekitUrl: 'wss://example.livekit.cloud',
  livekitApiKey: 'APIkey',
  livekitApiSecret: 'a-secret-long-enough-for-signing',
  groupSecret: 'group-secret-value',
  port: 3000,
  host: '127.0.0.1',
  tokenTtlSeconds: 600,
  rateLimitMax: 3,
  rateLimitWindow: '1 minute',
  trustProxy: false,
};

let app: FastifyInstance;

beforeEach(async () => {
  app = await buildApp(config);
});

afterEach(async () => {
  await app.close();
});

const post = (
  body: Record<string, unknown>,
  secret: string | null = config.groupSecret,
): Promise<LightMyRequestResponse> =>
  app.inject({
    method: 'POST',
    url: '/token',
    headers: secret === null ? {} : { [GROUP_SECRET_HEADER]: secret },
    payload: body,
  });

describe('POST /token', () => {
  it('issues a token for a valid request', async () => {
    // specs/room-access: "Solicitação válida"
    const res = await post({ room: 'sala-principal', identity: 'trxlezi' });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.url).toBe(config.livekitUrl);
    expect(typeof body.token).toBe('string');
    expect(body.token.split('.')).toHaveLength(3);
    expect(body.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('scopes the token to the requested room and identity', async () => {
    const res = await post({ room: 'sala-principal', identity: 'trxlezi' });
    const [, payload] = res.json().token.split('.');
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());

    expect(claims.sub).toBe('trxlezi');
    expect(claims.video.room).toBe('sala-principal');
    expect(claims.video.roomJoin).toBe(true);
    // The token must not be usable as a wildcard across rooms.
    expect(claims.video.roomCreate).toBeFalsy();
  });

  it('gives the token a bounded lifetime', async () => {
    const res = await post({ room: 'sala-principal', identity: 'trxlezi' });
    const [, payload] = res.json().token.split('.');
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());

    // specs/room-access: "Validade limitada da credencial"
    expect(claims.exp - claims.nbf).toBeLessThanOrEqual(config.tokenTtlSeconds);
  });

  it('rejects a request with no group secret', async () => {
    // specs/room-access: "Solicitante sem o segredo"
    const res = await post({ room: 'sala-principal', identity: 'trxlezi' }, null);
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('unauthorized');
  });

  it('rejects a request with the wrong group secret', async () => {
    const res = await post({ room: 'sala-principal', identity: 'trxlezi' }, 'wrong-secret-value');
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('unauthorized');
  });

  it('rejects a missing room', async () => {
    // specs/room-access: "Sala ou identidade ausente"
    const res = await post({ identity: 'trxlezi' });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('invalid_request');
  });

  it('rejects a missing identity', async () => {
    const res = await post({ room: 'sala-principal' });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('invalid_request');
  });

  it('rejects a room name that is not url-safe', async () => {
    const res = await post({ room: 'Sala Principal', identity: 'trxlezi' });
    expect(res.statusCode).toBe(400);
  });

  it('distinguishes a bad secret from a bad payload', async () => {
    // The UI needs to tell the participant which thing to fix.
    const badSecret = await post({ room: 'sala-principal', identity: 'trxlezi' }, 'nope-nope-nope');
    const badPayload = await post({ room: '', identity: '' });
    expect(badSecret.json().code).not.toBe(badPayload.json().code);
  });

  it('rate limits an origin that exceeds the window', async () => {
    // specs/room-access: "Excesso de solicitações"
    const body = { room: 'sala-principal', identity: 'trxlezi' };
    for (let i = 0; i < config.rateLimitMax; i += 1) {
      expect((await post(body)).statusCode).toBe(200);
    }

    const limited = await post(body);
    expect(limited.statusCode).toBe(429);
    expect(limited.json().code).toBe('rate_limited');
    expect(limited.json().retryAfter).toBeGreaterThan(0);
  });
});

describe('rate limiting behind a proxy', () => {
  const body = { room: 'sala-principal', identity: 'trxlezi' };

  const postFrom = (instance: FastifyInstance, forwardedFor: string) =>
    instance.inject({
      method: 'POST',
      url: '/token',
      headers: {
        [GROUP_SECRET_HEADER]: config.groupSecret,
        'x-forwarded-for': forwardedFor,
      },
      payload: body,
    });

  const exhaust = async (instance: FastifyInstance, forwardedFor: string): Promise<void> => {
    for (let i = 0; i < config.rateLimitMax; i += 1) {
      await postFrom(instance, forwardedFor);
    }
  };

  it('gives each participant their own budget when the proxy is trusted', async () => {
    // A tunnel or platform router makes every request arrive from one address.
    // Counting that address would turn the limit into a single budget shared by
    // the whole group, where one person reconnecting locks out everyone else.
    const proxied = await buildApp({ ...config, trustProxy: 1 });
    try {
      await exhaust(proxied, '1.1.1.1');
      expect((await postFrom(proxied, '1.1.1.1')).statusCode).toBe(429);

      // Someone who has not spent their own budget still gets through.
      expect((await postFrom(proxied, '2.2.2.2')).statusCode).toBe(200);
    } finally {
      await proxied.close();
    }
  });

  it('ignores the forwarded address when no proxy is trusted', async () => {
    // The default has to stay closed: trusting a header nobody set would let a
    // caller claim a fresh address per attempt and slip the limit entirely.
    await exhaust(app, '1.1.1.1');
    expect((await postFrom(app, '2.2.2.2')).statusCode).toBe(429);
  });
});

describe('GET /health', () => {
  it('answers without a secret', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
  });
});
