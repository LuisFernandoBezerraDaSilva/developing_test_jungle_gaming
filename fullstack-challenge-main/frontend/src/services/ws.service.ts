import { io, type Socket } from 'socket.io-client';
import { env } from '@/config/env';
import type { ServerToClientEvents } from '@/types/contract';

/**
 * Cliente WebSocket (camada Service). Namespace `/game`. O token JWT vai no
 * `auth` do handshake → o servidor faz join na room privada `player:<sub>`
 * (necessária para `bet:rejected`). Sem token, recebe só broadcasts.
 *
 * O servidor é a única fonte de verdade do multiplicador; este client apenas
 * encaminha os eventos. Nunca recalculamos estado localmente.
 */

type ClientSocket = Socket<ServerToClientEvents>;

let socket: ClientSocket | null = null;

export type WsStatus = 'connected' | 'disconnected' | 'connecting';

export const wsService = {
  /**
   * Conecta (ou reconfigura) o socket. Passar `token` para handshake autenticado.
   * Reconecta automaticamente quando o token muda (ex: após login).
   */
  connect(token?: string | null): ClientSocket {
    if (socket) {
      socket.disconnect();
      socket = null;
    }

    socket = io(`${env.wsUrl}/game`, {
      path: '/socket.io/', // path HTTP roteado pelo Kong (CONTRACT.md §5)
      transports: ['websocket'],
      auth: token ? { token } : {},
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
    });

    return socket;
  },

  /** Socket atual (pode ser null se ainda não conectado). */
  get(): ClientSocket | null {
    return socket;
  },

  disconnect(): void {
    socket?.disconnect();
    socket = null;
  },
};
