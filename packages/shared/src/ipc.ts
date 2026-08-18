import { z } from 'zod';
import { captureCapabilitiesSchema, captureRequestSchema, captureSourceSchema } from './capture.js';
import { preferencesSchema } from './preferences.js';
import { tokenResponseSchema } from './token.js';

/**
 * The full surface the renderer may reach through (design.md D5).
 *
 * Every channel declares both payload shapes, and both sides validate. The
 * preload exposes named functions built from this table — never raw ipcRenderer.
 * If a capability is not listed here, the renderer cannot reach it.
 */

const emptySchema = z.object({});

export const ipcContract = {
  'capture:capabilities': {
    request: emptySchema,
    response: captureCapabilitiesSchema,
  },
  'capture:sources': {
    request: emptySchema,
    response: z.object({ sources: z.array(captureSourceSchema) }),
  },
  'capture:start': {
    request: captureRequestSchema,
    /**
     * The main process only authorises the capture and reports whether system
     * audio was actually obtained; the media stream itself is acquired in the
     * renderer via getDisplayMedia, which the handler intercepts.
     */
    response: z.object({ sourceId: z.string(), systemAudioGranted: z.boolean() }),
  },
  'capture:stop': {
    request: emptySchema,
    response: emptySchema,
  },
  'hotkey:register': {
    request: z.object({ accelerator: z.string().min(1) }),
    response: z.object({ ok: z.boolean(), reason: z.string().nullable() }),
  },
  'hotkey:unregister': {
    request: emptySchema,
    response: emptySchema,
  },
  'prefs:get': {
    request: emptySchema,
    response: preferencesSchema,
  },
  'prefs:set': {
    request: preferencesSchema.partial(),
    response: preferencesSchema,
  },
  'token:request': {
    request: z.object({ room: z.string(), identity: z.string() }),
    response: tokenResponseSchema,
  },
  'app:quit': {
    request: emptySchema,
    response: emptySchema,
  },
  'app:version': {
    request: emptySchema,
    response: z.object({ version: z.string() }),
  },
} as const;

export type IpcContract = typeof ipcContract;
export type IpcChannel = keyof IpcContract;

export type IpcRequest<C extends IpcChannel> = z.infer<IpcContract[C]['request']>;
export type IpcResponse<C extends IpcChannel> = z.infer<IpcContract[C]['response']>;

/**
 * Events pushed from main to renderer. One-way — the renderer subscribes.
 */
export const ipcEvents = {
  'hotkey:down': z.object({}),
  'hotkey:up': z.object({}),
  'update:available': z.object({ version: z.string() }),
  'update:downloaded': z.object({ version: z.string() }),
  'update:error': z.object({ message: z.string() }),
  'devices:changed': z.object({}),
} as const;

export type IpcEvents = typeof ipcEvents;
export type IpcEventName = keyof IpcEvents;
export type IpcEventPayload<E extends IpcEventName> = z.infer<IpcEvents[E]>;

/** Shape the preload exposes on window.nigord. */
export interface NigordBridge {
  invoke<C extends IpcChannel>(channel: C, payload: IpcRequest<C>): Promise<IpcResponse<C>>;
  on<E extends IpcEventName>(event: E, listener: (payload: IpcEventPayload<E>) => void): () => void;
}
