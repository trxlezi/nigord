import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

const validEnv = {
  LIVEKIT_URL: 'wss://example.livekit.cloud',
  LIVEKIT_API_KEY: 'APIkey',
  LIVEKIT_API_SECRET: 'supersecretvalue',
  NIGORD_GROUP_SECRET: 'group-secret-value',
};

describe('config', () => {
  it('applies defaults for optional values', () => {
    expect(loadConfig(validEnv).tokenTtlSeconds).toBe(600);
  });

  it('reads an overridden token lifetime', () => {
    expect(loadConfig({ ...validEnv, TOKEN_TTL_SECONDS: '900' }).tokenTtlSeconds).toBe(900);
  });

  it('refuses to load without LiveKit credentials', () => {
    // specs/room-access: "Configuração ausente no serviço"
    expect(() => loadConfig({ ...validEnv, LIVEKIT_API_SECRET: undefined })).toThrow(ConfigError);
    expect(() => loadConfig({ ...validEnv, LIVEKIT_API_KEY: undefined })).toThrow(ConfigError);
  });

  it('refuses to load without a group secret', () => {
    expect(() => loadConfig({ ...validEnv, NIGORD_GROUP_SECRET: undefined })).toThrow(ConfigError);
  });

  it('rejects a trivially short group secret', () => {
    expect(() => loadConfig({ ...validEnv, NIGORD_GROUP_SECRET: 'short' })).toThrow(ConfigError);
  });

  it('reports every problem at once rather than the first', () => {
    try {
      loadConfig({});
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).issues.length).toBeGreaterThan(2);
    }
  });
});
