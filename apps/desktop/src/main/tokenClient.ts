import { GROUP_SECRET_HEADER, type TokenResponse, tokenResponseSchema } from '@nigord/shared';

/**
 * Fetches room credentials from the token server.
 *
 * This lives in the main process on purpose: the group secret must not be
 * reachable from the renderer, which runs untrusted-by-design page code.
 */
export class TokenClient {
  constructor(
    private readonly baseUrl: string,
    private readonly groupSecret: string,
  ) {}

  async request(room: string, identity: string): Promise<TokenResponse> {
    const response = await fetch(new URL('/token', this.baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [GROUP_SECRET_HEADER]: this.groupSecret,
      },
      body: JSON.stringify({ room, identity }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      // The message is surfaced verbatim so the UI can distinguish a bad
      // secret from a malformed room name, per specs/voice-session.
      throw new Error(body?.message ?? `Token request failed (${response.status})`);
    }

    return tokenResponseSchema.parse(await response.json());
  }
}
