import { z } from 'zod';
import { contentKindSchema } from './session.js';

/**
 * The platform boundary's data contract (design.md D2).
 *
 * The renderer never learns which platform it runs on. It asks for capabilities
 * and sources, and receives an honest answer — the Linux development stub
 * reports what is unavailable rather than pretending to succeed.
 */

export const captureSourceKindSchema = z.enum(['screen', 'window']);
export type CaptureSourceKind = z.infer<typeof captureSourceKindSchema>;

export const captureSourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: captureSourceKindSchema,
  /** data: URI preview, so the picker can show what each source looks like. */
  thumbnail: z.string().nullable(),
});
export type CaptureSource = z.infer<typeof captureSourceSchema>;

/**
 * Why a capability is unavailable, phrased for display. `null` reason means
 * available. See specs/screen-sharing "Captura de áudio do sistema indisponível".
 */
export const capabilitySchema = z.object({
  available: z.boolean(),
  reason: z.string().nullable(),
});
export type Capability = z.infer<typeof capabilitySchema>;

export const captureCapabilitiesSchema = z.object({
  screenCapture: capabilitySchema,
  systemAudio: capabilitySchema,
  globalHotkeys: capabilitySchema,
});
export type CaptureCapabilities = z.infer<typeof captureCapabilitiesSchema>;

export const captureRequestSchema = z.object({
  sourceId: z.string().min(1),
  includeSystemAudio: z.boolean(),
  contentKind: contentKindSchema,
});
export type CaptureRequest = z.infer<typeof captureRequestSchema>;
