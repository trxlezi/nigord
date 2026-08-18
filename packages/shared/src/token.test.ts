import { describe, expect, it } from 'vitest';
import {
  decodeTokenFailure,
  encodeTokenFailure,
  participantIdentitySchema,
  roomNameSchema,
  tokenErrorCodeSchema,
  tokenRequestSchema,
} from './token.js';

describe('token request contract', () => {
  it('accepts a well-formed request', () => {
    const parsed = tokenRequestSchema.parse({ room: 'sala-principal', identity: 'trxlezi' });
    expect(parsed.room).toBe('sala-principal');
  });

  it('rejects room names that are not url-safe', () => {
    expect(() => roomNameSchema.parse('Sala Principal')).toThrow();
    expect(() => roomNameSchema.parse('-leading-dash')).toThrow();
  });

  it('trims surrounding whitespace on identity', () => {
    expect(participantIdentitySchema.parse('  trxlezi  ')).toBe('trxlezi');
  });

  it('rejects an empty identity', () => {
    expect(() => participantIdentitySchema.parse('   ')).toThrow();
  });
});

describe('token failure codec', () => {
  it('round-trips every code', () => {
    for (const code of [...tokenErrorCodeSchema.options, 'unreachable'] as const) {
      const encoded = encodeTokenFailure(code, 'algo aconteceu');
      expect(decodeTokenFailure(encoded)).toEqual({ code, message: 'algo aconteceu' });
    }
  });

  it('finds the code when the message is wrapped by the IPC layer', () => {
    // Electron prefixes the channel name, which is what broke prose matching.
    const wrapped = `Error invoking remote method 'token:request': Error: ${encodeTokenFailure(
      'unreachable',
      'fetch failed',
    )}`;
    expect(decodeTokenFailure(wrapped)?.code).toBe('unreachable');
  });

  it('does not invent a code for an unrelated error', () => {
    expect(decodeTokenFailure("Error invoking remote method 'token:request': oops")).toBeNull();
    expect(decodeTokenFailure('nigord-token-failure/not_a_code x')).toBeNull();
  });
});
