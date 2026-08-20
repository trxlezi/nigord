/**
 * Channel and event names as plain data, with no zod import.
 *
 * The preload runs sandboxed, where require() reaches almost nothing — pulling
 * the schema module in would drag zod along and fail at runtime. The preload
 * only needs to know which names are legal; validation belongs to main and to
 * the renderer, which both have a real module system.
 *
 * ipc.ts asserts at compile time that these lists match the contract exactly,
 * so a channel can never be added in one place and forgotten in the other.
 */
export const ipcChannelNames = [
  'capture:capabilities',
  'capture:sources',
  'capture:start',
  'capture:stop',
  'hotkey:register',
  'hotkey:unregister',
  'prefs:get',
  'prefs:set',
  'token:request',
  'app:quit',
  'app:version',
] as const;

export const ipcEventNames = [
  'hotkey:down',
  'hotkey:up',
  'update:available',
  'update:downloaded',
  'update:error',
  'devices:changed',
] as const;

export type IpcChannelName = (typeof ipcChannelNames)[number];
export type IpcEventNameLiteral = (typeof ipcEventNames)[number];
