import { z } from 'zod';

/**
 * Runtime connection settings, configured by the participant instead of baked
 * into the build (task 9.5).
 *
 * The group secret is deliberately asymmetric: the renderer may WRITE it, since
 * someone has to type it, but never reads it back. specs/room-access keeps media
 * credentials out of the client, and the same reasoning applies here — the
 * fewer places the secret can be read from, the fewer ways it leaks. The
 * renderer only learns whether one is set.
 */

export const clientConfigSchema = z.object({
  /** Base URL of the token server, e.g. https://nigord-token.fly.dev */
  tokenServerUrl: z.string(),
  /** True when a group secret is stored. The value itself never crosses back. */
  hasSecret: z.boolean(),
  /**
   * True when the values come from the environment rather than from stored
   * settings, in which case the UI must not present them as editable.
   */
  fromEnvironment: z.boolean(),
});

export const clientConfigPatchSchema = z.object({
  tokenServerUrl: z.string().trim().url('Informe uma URL completa, com https://').optional(),
  groupSecret: z.string().trim().min(1).optional(),
});

export type ClientConfig = z.infer<typeof clientConfigSchema>;
export type ClientConfigPatch = z.infer<typeof clientConfigPatchSchema>;
