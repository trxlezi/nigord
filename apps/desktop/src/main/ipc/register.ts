import { ipcMain } from 'electron';
import { type IpcChannel, type IpcRequest, type IpcResponse, ipcContract } from '@nigord/shared';

/**
 * Typed IPC with validation on both ends (task 6.3, design.md D5).
 *
 * Every payload is checked against the shared Zod schema on the way in and on
 * the way out. The renderer is sandboxed and cannot be trusted to send
 * well-formed messages; validating the response too catches our own drift
 * between the contract and the handler.
 */
export type IpcHandler<C extends IpcChannel> = (
  payload: IpcRequest<C>,
) => IpcResponse<C> | Promise<IpcResponse<C>>;

export type IpcHandlers = { [C in IpcChannel]: IpcHandler<C> };

export function registerIpc(handlers: IpcHandlers): void {
  for (const channel of Object.keys(ipcContract) as IpcChannel[]) {
    ipcMain.handle(channel, async (_event, rawPayload: unknown) => {
      const schema = ipcContract[channel];

      const request = schema.request.safeParse(rawPayload ?? {});
      if (!request.success) {
        throw new Error(`Invalid payload on "${channel}": ${request.error.message}`);
      }

      const handler = handlers[channel] as IpcHandler<IpcChannel>;
      const result = await handler(request.data as never);

      const response = schema.response.safeParse(result);
      if (!response.success) {
        throw new Error(`Invalid response on "${channel}": ${response.error.message}`);
      }
      return response.data;
    });
  }
}
