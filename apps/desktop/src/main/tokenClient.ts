import {
  GROUP_SECRET_HEADER,
  type TokenResponse,
  encodeTokenFailure,
  tokenErrorSchema,
  tokenResponseSchema,
} from '@nigord/shared';

/**
 * Fetches room credentials from the token server.
 *
 * This lives in the main process on purpose: the group secret must not be
 * reachable from the renderer, which runs untrusted-by-design page code.
 */
export class TokenClient {
  /**
   * The settings are read at request time, not captured in the constructor: the
   * participant can change the server or the secret mid-run from the settings
   * screen, and a client holding a stale copy would keep failing until restart.
   */
  constructor(private readonly settings: () => { baseUrl: string; groupSecret: string }) {}

  async request(room: string, identity: string): Promise<TokenResponse> {
    const { baseUrl, groupSecret } = this.settings();
    if (!baseUrl || !groupSecret) {
      throw new Error(
        encodeTokenFailure('unconfigured', 'Servidor ou segredo do grupo ainda não configurados.'),
      );
    }

    let response: Response;
    try {
      response = await fetch(new URL('/token', baseUrl), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [GROUP_SECRET_HEADER]: groupSecret,
        },
        body: JSON.stringify({ room, identity }),
      });
    } catch (error) {
      // No response at all: wrong address, server down, or no network. The
      // participant can only fix this by checking the connection, never the
      // secret — so it must not read as a credential problem.
      throw new Error(
        encodeTokenFailure('unreachable', error instanceof Error ? error.message : String(error)),
      );
    }

    if (!response.ok) {
      // The server's own code is carried through, so the UI can distinguish a
      // bad secret from a malformed room name, per specs/voice-session.
      const body = tokenErrorSchema.safeParse(await response.json().catch(() => null));
      if (body.success) throw new Error(encodeTokenFailure(body.data.code, body.data.message));

      // A response that is not the documented error shape is the server
      // misbehaving, not the participant's credential.
      throw new Error(
        encodeTokenFailure('server_error', `Token request failed (${response.status})`),
      );
    }

    return tokenResponseSchema.parse(await response.json());
  }
}
