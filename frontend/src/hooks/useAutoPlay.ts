import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useRoundStore } from '@/stores/round.store';
import { useAuthStore } from '@/stores/auth.store';
import { useSettingsStore } from '@/stores/settings.store';
import { usePlaceBet, useCashout } from '@/hooks/useGameQueries';
import { reaisToCents } from '@/lib/money';
import {
  isWithinBetRange,
  nextBetAmountCents,
  shouldStopAutoBet,
} from '@/lib/autobet';

/**
 * Orquestração de auto-bet e auto-cashout (bônus). Reage ao estado da rodada
 * (fonte de verdade do servidor via WS) e dispara as ações do jogador SEMPRE
 * via REST (mutations), nunca recalculando estado localmente.
 *
 * Guards por `roundId` evitam disparo duplicado dentro da mesma rodada. Todo
 * cálculo de valor é em centavos inteiros (BigInt).
 */
export function useAutoPlay(): void {
  const phase = useRoundStore((s) => s.phase);
  const roundId = useRoundStore((s) => s.roundId);
  const multiplier = useRoundStore((s) => s.multiplier);
  const bets = useRoundStore((s) => s.bets);
  const userSub = useAuthStore((s) => s.user?.sub ?? null);

  const autoCashout = useSettingsStore((s) => s.autoCashout);
  const autoBet = useSettingsStore((s) => s.autoBet);
  const setAutoBet = useSettingsStore((s) => s.setAutoBet);

  const placeBet = usePlaceBet();
  const cashout = useCashout();

  const betRoundRef = useRef<string | null>(null);
  const cashoutRoundRef = useRef<string | null>(null);
  const settledRoundRef = useRef<string | null>(null);
  const nextAmountRef = useRef<bigint | null>(null);
  const lastAmountRef = useRef<bigint | null>(null);
  const profitRef = useRef<bigint>(0n);
  const prevAutoBetEnabled = useRef(autoBet.enabled);

  // Reinicia o estado da sessão de auto-bet ao (re)ativar.
  useEffect(() => {
    if (autoBet.enabled && !prevAutoBetEnabled.current) {
      nextAmountRef.current = null;
      lastAmountRef.current = null;
      profitRef.current = 0n;
    }
    prevAutoBetEnabled.current = autoBet.enabled;
  }, [autoBet.enabled]);

  // Auto-cashout: saca quando o multiplicador do servidor atinge o alvo.
  useEffect(() => {
    if (!autoCashout.enabled || phase !== 'RUNNING' || !roundId || !userSub) return;
    if (cashoutRoundRef.current === roundId) return;

    const myPending = bets.find(
      (b) => b.playerId === userSub && b.status === 'PENDING',
    );
    if (!myPending) return;

    const target = Number(autoCashout.target);
    const current = Number(multiplier);
    if (!Number.isNaN(target) && !Number.isNaN(current) && current >= target) {
      cashoutRoundRef.current = roundId;
      cashout.mutate();
    }
  }, [autoCashout, phase, roundId, multiplier, bets, userSub, cashout]);

  // Auto-bet: aposta automaticamente ao abrir a fase de apostas.
  useEffect(() => {
    if (!autoBet.enabled || phase !== 'BETTING' || !roundId || !userSub) return;
    if (betRoundRef.current === roundId) return;
    if (bets.some((b) => b.playerId === userSub)) return;

    const baseCents = reaisToCents(autoBet.baseAmount);
    if (baseCents === null) {
      setAutoBet({ enabled: false });
      toast.error('Auto-bet: valor base inválido.');
      return;
    }

    const stopProfitCents = parseOptionalCents(autoBet.stopProfit);
    const stopLossCents = parseOptionalCents(autoBet.stopLoss);
    if (
      shouldStopAutoBet({
        profitCents: profitRef.current,
        stopProfitCents,
        stopLossCents,
      })
    ) {
      setAutoBet({ enabled: false });
      toast.success('Auto-bet encerrado (limite de lucro/perda atingido).');
      return;
    }

    const amountCents = nextAmountRef.current ?? BigInt(baseCents);
    if (!isWithinBetRange(amountCents)) {
      setAutoBet({ enabled: false });
      toast.error('Auto-bet interrompido: valor fora do limite (R$ 1–1.000).');
      return;
    }

    betRoundRef.current = roundId;
    lastAmountRef.current = amountCents;
    placeBet.mutate(amountCents.toString());
  }, [autoBet, phase, roundId, bets, userSub, placeBet, setAutoBet]);

  // Liquidação: atualiza lucro acumulado e o próximo valor (Martingale).
  useEffect(() => {
    if (phase !== 'CRASHED' || !roundId || !userSub) return;
    if (settledRoundRef.current === roundId) return;
    settledRoundRef.current = roundId;

    const myBet = bets.find((b) => b.playerId === userSub);
    if (!myBet || (myBet.status !== 'WON' && myBet.status !== 'LOST')) return;

    const amountCents = BigInt(myBet.amountCents);
    const won = myBet.status === 'WON';
    const payoutCents = won ? BigInt(myBet.payoutCents ?? '0') : 0n;
    profitRef.current += payoutCents - amountCents;

    if (autoBet.enabled) {
      const baseCents = reaisToCents(autoBet.baseAmount);
      if (baseCents !== null) {
        nextAmountRef.current = nextBetAmountCents({
          strategy: autoBet.strategy,
          baseCents: BigInt(baseCents),
          lastAmountCents: amountCents,
          lastWon: won,
        });
      }
    }
  }, [phase, roundId, bets, userSub, autoBet]);
}

/** Converte reais opcionais em centavos; vazio/inválido = sem limite (null). */
function parseOptionalCents(value: string): bigint | null {
  if (!value.trim()) return null;
  const cents = reaisToCents(value);
  return cents === null ? null : BigInt(cents);
}
