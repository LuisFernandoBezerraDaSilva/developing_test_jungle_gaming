import { http } from './http';
import type {
  CashoutResponse,
  CurrentRoundResponse,
  LeaderboardResponse,
  MyBetsResponse,
  PlaceBetResponse,
  RoundHistoryResponse,
  VerifyResponse,
} from '@/types/contract';

/**
 * Game Service (camada Service). Ações do jogador (apostar, sacar) são SEMPRE
 * via REST; o WebSocket é só server→client.
 */
export const gameService = {
  /** Estado da rodada atual (sem auth). 404 = nenhuma rodada existe ainda. */
  currentRound(): Promise<CurrentRoundResponse> {
    return http.get<CurrentRoundResponse>('/games/rounds/current');
  },

  /** Histórico paginado de rodadas (sem auth). */
  history(page = 1, limit = 20): Promise<RoundHistoryResponse> {
    return http.get<RoundHistoryResponse>('/games/rounds/history', {
      query: { page, limit },
    });
  },

  /** Dados de verificação provably fair de uma rodada (sem auth). */
  verify(roundId: string): Promise<VerifyResponse> {
    return http.get<VerifyResponse>(`/games/rounds/${roundId}/verify`);
  },

  /** Leaderboard — top jogadores por lucro no período (sem auth). */
  leaderboard(period: '24h' | 'week' = '24h'): Promise<LeaderboardResponse> {
    return http.get<LeaderboardResponse>('/games/leaderboard', {
      query: { period },
    });
  },

  /** Histórico de apostas do jogador autenticado. */
  myBets(page = 1, limit = 20): Promise<MyBetsResponse> {
    return http.get<MyBetsResponse>('/games/bets/me', {
      auth: true,
      query: { page, limit },
    });
  },

  /** Faz aposta na rodada atual. amountCents entre "100" e "100000". */
  placeBet(amountCents: string): Promise<PlaceBetResponse> {
    return http.post<PlaceBetResponse>('/games/bet', {
      auth: true,
      body: { amountCents },
    });
  },

  /** Saca no multiplicador atual (usa roundId ativo + sub do JWT). */
  cashout(): Promise<CashoutResponse> {
    return http.post<CashoutResponse>('/games/bet/cashout', {
      auth: true,
      body: {},
    });
  },
};
