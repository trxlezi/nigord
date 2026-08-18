import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeTokenFailure } from '@nigord/shared';
import { TokenClient } from './tokenClient.js';

/**
 * These exist because the first version threw the server's prose and dropped
 * its code, which left the UI guessing — and guessing wrong: a server that was
 * simply down was reported to the participant as a rejected credential.
 */
const client = (): TokenClient => new TokenClient('http://localhost:3000', 'segredo');

const codeOf = async (promise: Promise<unknown>): Promise<string | null> => {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(Error);
  return decodeTokenFailure((error as Error).message)?.code ?? null;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

const stubFetch = (implementation: () => Promise<unknown>): void => {
  vi.stubGlobal('fetch', vi.fn(implementation));
};

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('TokenClient failures', () => {
  it('reports an unreachable server as unreachable, not as a bad credential', async () => {
    stubFetch(() => Promise.reject(new TypeError('fetch failed')));
    expect(await codeOf(client().request('sala', 'trxlezi'))).toBe('unreachable');
  });

  it('carries the server code through', async () => {
    stubFetch(() =>
      Promise.resolve(
        jsonResponse(401, { code: 'unauthorized', message: 'Invalid or missing group secret.' }),
      ),
    );
    expect(await codeOf(client().request('sala', 'trxlezi'))).toBe('unauthorized');
  });

  it('distinguishes a malformed request from a rejected secret', async () => {
    stubFetch(() =>
      Promise.resolve(jsonResponse(400, { code: 'invalid_request', message: 'Room name…' })),
    );
    expect(await codeOf(client().request('Sala Inválida', 'trxlezi'))).toBe('invalid_request');
  });

  it('treats an undocumented error body as a server fault', async () => {
    stubFetch(() => Promise.resolve(new Response('<html>502</html>', { status: 502 })));
    expect(await codeOf(client().request('sala', 'trxlezi'))).toBe('server_error');
  });

  it('returns the credentials on success', async () => {
    const payload = { token: 'jwt', url: 'wss://media.example', expiresAt: 1_700_000_000 };
    stubFetch(() => Promise.resolve(jsonResponse(200, payload)));
    await expect(client().request('sala', 'trxlezi')).resolves.toEqual(payload);
  });
});
