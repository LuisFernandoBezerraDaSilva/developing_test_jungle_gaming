import { create } from 'zustand';
import type {
  BetCashedOutPayload,
  BetPlacedPayload,
  RoundBet,
  RoundBettingStartedPayload,
  RoundCrashedPayload,
  RoundPhase,
  RoundSnapshotPayload,
  RoundStartedPayload,
} from '@/types/contract';

/**
 * Estado da rodada em tempo real (Zustand), dirigido EXCLUSIVAMENTE pelos
 * eventos WebSocket do servidor. O multiplicador exibido vem do `round:tick`;
 * nunca é recalculado localmente. Assim, múltiplas abas mostram o mesmo estado
 * (requisito eliminatório E4 de sincronização).
 */

type RoundState = {
  roundId: string | null;
  phase: RoundPhase | null;
  phaseStartedAt: string | null;
  bettingWindowSeconds: number;
  /** Multiplicador corrente "x.xx", fonte: round:tick. */
  multiplier: string;
  serverHash: string | null;
  bets: RoundBet[];
  /** Dados de revelação do crash (provably fair), após round:crashed. */
  crash: RoundCrashedPayload | null;

  applySnapshot: (p: RoundSnapshotPayload) => void;
  applyBettingStarted: (p: RoundBettingStartedPayload, at: string) => void;
  applyStarted: (p: RoundStartedPayload) => void;
  applyTick: (p: { roundId: string; multiplier: string }) => void;
  applyCrashed: (p: RoundCrashedPayload) => void;
  applyBetPlaced: (p: BetPlacedPayload) => void;
  applyBetCashedOut: (p: BetCashedOutPayload) => void;
  applyBetRejected: (playerId: string) => void;
};

const initial = {
  roundId: null,
  phase: null,
  phaseStartedAt: null,
  bettingWindowSeconds: 0,
  multiplier: '1.00',
  serverHash: null,
  bets: [] as RoundBet[],
  crash: null,
};

export const useRoundStore = create<RoundState>((set) => ({
  ...initial,

  applySnapshot(p) {
    set({
      roundId: p.roundId,
      phase: p.phase,
      phaseStartedAt: p.phaseStartedAt,
      bettingWindowSeconds: p.bettingWindowSeconds,
      multiplier: p.currentMultiplier || '1.00',
      serverHash: p.serverHash,
      bets: p.bets,
      crash: null,
    });
  },

  applyBettingStarted(p, at) {
    set({
      roundId: p.roundId,
      phase: 'BETTING',
      phaseStartedAt: at,
      bettingWindowSeconds: p.bettingWindowSeconds,
      multiplier: '1.00',
      serverHash: p.serverHash,
      bets: [],
      crash: null,
    });
  },

  applyStarted(p) {
    set((s) =>
      s.roundId === p.roundId
        ? { phase: 'RUNNING', phaseStartedAt: p.startedAt }
        : s,
    );
  },

  applyTick(p) {
    set((s) => (s.roundId === p.roundId ? { multiplier: p.multiplier } : s));
  },

  applyCrashed(p) {
    set((s) =>
      s.roundId === p.roundId
        ? {
            phase: 'CRASHED',
            multiplier: p.crashMultiplier,
            crash: p,
            // Liquidação refletida na lista: quem não sacou perde; quem sacou ganha.
            bets: s.bets.map((b) => {
              if (b.status === 'PENDING') {
                return { ...b, status: 'LOST', payoutCents: '0' };
              }
              if (b.status === 'CASHED_OUT') {
                return { ...b, status: 'WON' };
              }
              return b;
            }),
          }
        : s,
    );
  },

  applyBetPlaced(p) {
    set((s) => {
      if (s.roundId !== p.roundId) return s;
      if (s.bets.some((b) => b.playerId === p.playerId)) return s;
      const bet: RoundBet = {
        playerId: p.playerId,
        username: p.username,
        amountCents: p.amountCents,
        status: 'PENDING',
        cashoutMultiplier: null,
        payoutCents: null,
      };
      return { bets: [...s.bets, bet] };
    });
  },

  applyBetCashedOut(p) {
    set((s) => {
      if (s.roundId !== p.roundId) return s;
      return {
        bets: s.bets.map((b) =>
          b.playerId === p.playerId
            ? {
                ...b,
                status: 'CASHED_OUT',
                cashoutMultiplier: p.cashoutMultiplier,
                payoutCents: p.payoutCents,
              }
            : b,
        ),
      };
    });
  },

  applyBetRejected(playerId) {
    set((s) => ({ bets: s.bets.filter((b) => b.playerId !== playerId) }));
  },
}));
