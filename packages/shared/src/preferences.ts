import { z } from 'zod';
import {
  contentKindSchema,
  micModeSchema,
  shareBitrateSchema,
  shareFramerateSchema,
  shareResolutionSchema,
} from './session.js';
import { participantIdentitySchema, roomNameSchema } from './token.js';

/**
 * Everything persisted between runs. See specs/desktop-shell
 * "Persistência de preferências locais".
 *
 * Every field has a default so that a missing or corrupted preferences file
 * degrades to defaults instead of failing to start.
 */
export const preferencesSchema = z.object({
  identity: participantIdentitySchema.or(z.literal('')).default(''),
  lastRoom: roomNameSchema.or(z.literal('')).default(''),
  inputDeviceId: z.string().default('default'),
  outputDeviceId: z.string().default('default'),
  micMode: micModeSchema.default('open'),
  /** Electron accelerator string, e.g. "F13" or "CommandOrControl+Shift+K". */
  pushToTalkKey: z.string().default('F13'),
  defaultContentKind: contentKindSchema.default('motion'),
  /** Qualidade escolhida no último compartilhamento. */
  shareResolution: shareResolutionSchema.default('1080p'),
  shareFramerate: shareFramerateSchema.default(60),
  shareBitrate: shareBitrateSchema.default('high'),
  shareSystemAudioByDefault: z.boolean().default(true),
  /** Per-participant voice volume, 0..1, keyed by identity. */
  voiceVolumes: z.record(z.string(), z.number().min(0).max(1)).default({}),
  /** Per-participant system-audio volume, 0..1, keyed by identity. */
  systemAudioVolumes: z.record(z.string(), z.number().min(0).max(1)).default({}),
  /** Identities muted locally by this participant only. */
  locallyMuted: z.array(z.string()).default([]),
});

export type Preferences = z.infer<typeof preferencesSchema>;

export const defaultPreferences = (): Preferences => preferencesSchema.parse({});
