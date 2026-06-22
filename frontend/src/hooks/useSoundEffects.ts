import { useEffect, useRef } from 'react';
import { useRoundStore } from '@/stores/round.store';
import { useAuthStore } from '@/stores/auth.store';
import { useSettingsStore } from '@/stores/settings.store';
import { sound } from '@/services/sound.service';
import type { BetStatus } from '@/types/contract';

/**
 * Toca efeitos sonoros (bônus) reagindo às transições da rodada e ao status da
 * aposta do próprio jogador. Concentra o efeito colateral de áudio fora dos
 * componentes de apresentação. Respeita a preferência `soundEnabled`.
 */
export function useSoundEffects(): void {
  const phase = useRoundStore((s) => s.phase);
  const bets = useRoundStore((s) => s.bets);
  const userSub = useAuthStore((s) => s.user?.sub ?? null);
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);

  const prevPhase = useRef(phase);
  const prevMyStatus = useRef<BetStatus | null>(null);

  useEffect(() => {
    const myStatus = userSub
      ? (bets.find((b) => b.playerId === userSub)?.status ?? null)
      : null;

    if (soundEnabled) {
      // Transições de status da própria aposta.
      if (prevMyStatus.current !== myStatus) {
        if (myStatus === 'PENDING') sound.bet();
        else if (myStatus === 'CASHED_OUT') sound.cashout();
      }

      // Transições de fase da rodada.
      if (prevPhase.current !== phase && phase === 'CRASHED') {
        if (myStatus === 'WON') sound.win();
        else sound.crash();
      }
    }

    prevMyStatus.current = myStatus;
    prevPhase.current = phase;
  }, [phase, bets, userSub, soundEnabled]);
}
