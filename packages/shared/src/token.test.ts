import { describe, expect, it } from 'vitest';
import { participantIdentitySchema, roomNameSchema, tokenRequestSchema } from './token.js';

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
