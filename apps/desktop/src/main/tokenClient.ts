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
  constructor(
    private readonly baseUrl: string,
    private readonly groupSecret: string,
  ) {}

  async request(room: string, identity: string): Promise<TokenResponse> {
    let response: Response;
    try {
      response = await fetch(new URL('/token', this.baseUrl), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [GROUP_SECRET_HEADER]: this.groupSecret,
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
