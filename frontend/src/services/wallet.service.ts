import { http } from './http';
import type { WalletResponse } from '@/types/contract';

/**
 * Wallet Service (camada Service). Crédito/débito NÃO existem via REST —
 * acontecem via eventos no backend. Aqui só leitura/criação da carteira.
 */
export const walletService = {
  /** Cria a carteira do jogador autenticado (idempotente no backend). */
  create(): Promise<WalletResponse> {
    return http.post<WalletResponse>('/wallets', { auth: true, body: {} });
  },

  /** Carteira e saldo do jogador autenticado. */
  me(): Promise<WalletResponse> {
    return http.get<WalletResponse>('/wallets/me', { auth: true });
  },
};
