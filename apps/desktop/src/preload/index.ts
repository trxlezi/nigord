import { contextBridge, ipcRenderer } from 'electron';
import type {
  IpcChannel,
  IpcEventName,
  IpcEventPayload,
  IpcRequest,
  IpcResponse,
  NigordBridge,
} from '@nigord/shared';
import { ipcChannelNames, ipcEventNames } from '@nigord/shared/ipc-names';

/**
 * The entire privileged surface available to the renderer (task 6.2).
 *
 * Raw ipcRenderer is never exposed. The renderer can reach exactly the channels
 * declared in the shared contract and nothing else — adding a capability means
 * adding it to the contract, which is the point.
 */
const bridge: NigordBridge = {
  invoke<C extends IpcChannel>(channel: C, payload: IpcRequest<C>): Promise<IpcResponse<C>> {
    if (!(ipcChannelNames as readonly string[]).includes(channel)) {
      return Promise.reject(new Error(`Unknown channel: ${String(channel)}`));
    }
    return ipcRenderer.invoke(channel, payload) as Promise<IpcResponse<C>>;
  },

  on<E extends IpcEventName>(
    event: E,
    listener: (payload: IpcEventPayload<E>) => void,
  ): () => void {
    if (!(ipcEventNames as readonly string[]).includes(event)) {
      throw new Error(`Unknown event: ${String(event)}`);
    }

    // The Electron event object is dropped rather than forwarded: it carries
    // sender references that have no business crossing into page code.
    const wrapped = (_event: unknown, payload: unknown): void =>
      listener(payload as IpcEventPayload<E>);

    ipcRenderer.on(event, wrapped);
    return () => {
      ipcRenderer.removeListener(event, wrapped);
    };
  },
};

contextBridge.exposeInMainWorld('nigord', bridge);
