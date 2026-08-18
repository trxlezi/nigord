import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { ClientConfig, ClientConfigPatch } from '@nigord/shared';

/**
 * Where the app points and what it presents to get in (task 9.5).
 *
 * Kept out of preferences.json for one reason: the renderer reads preferences
 * wholesale, and the group secret must not travel that way. This store is only
 * ever read by the main process; the renderer gets `hasSecret`, never the value.
 *
 * The environment still wins when set, which is what keeps development and the
 * driver script working without touching a participant's stored settings.
 */
const storedSchema = z.object({
  tokenServerUrl: z.string().default(''),
  groupSecret: z.string().default(''),
});

type Stored = z.infer<typeof storedSchema>;

export class ConfigStore {
  private readonly path: string;
  private stored: Stored;

  private readonly envUrl = process.env['NIGORD_TOKEN_SERVER'] ?? '';
  private readonly envSecret = process.env['NIGORD_GROUP_SECRET'] ?? '';

  constructor(userDataPath: string) {
    this.path = join(userDataPath, 'connection.json');
    this.stored = this.read();
  }

  /** True when the environment supplies both halves, as in development. */
  private get fromEnvironment(): boolean {
    return this.envUrl !== '' && this.envSecret !== '';
  }

  /** What the renderer is allowed to know. Never includes the secret. */
  get view(): ClientConfig {
    return {
      tokenServerUrl: this.tokenServerUrl,
      hasSecret: this.groupSecret !== '',
      fromEnvironment: this.fromEnvironment,
    };
  }

  get tokenServerUrl(): string {
    return this.envUrl || this.stored.tokenServerUrl;
  }

  get groupSecret(): string {
    return this.envSecret || this.stored.groupSecret;
  }

  update(patch: ClientConfigPatch): ClientConfig {
    const defined = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined && value !== ''),
    );
    this.stored = storedSchema.parse({ ...this.stored, ...defined });
    try {
      // 0o600: the file holds the group's shared secret, so it is not readable
      // by other accounts on a shared machine.
      writeFileSync(this.path, JSON.stringify(this.stored, null, 2), {
        encoding: 'utf8',
        mode: 0o600,
      });
    } catch {
      // Losing the setting costs a retype next launch; taking the app down
      // costs the session.
    }
    return this.view;
  }

  private read(): Stored {
    try {
      return storedSchema.parse(JSON.parse(readFileSync(this.path, 'utf8')));
    } catch {
      // Missing or corrupted: start from empty and let the participant
      // configure, exactly as on first run.
      return storedSchema.parse({});
    }
  }
}
