import { useEffect } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { wsService } from '@/services/ws.service';
import { useRoundStore } from '@/stores/round.store';
import { useAuthStore } from '@/stores/auth.store';
import type {
  BetCashedOutPayload,
  BetPlacedPayload,
  BetRejectedPayload,
  RoundBettingStartedPayload,
  RoundCrashedPayload,
  RoundSnapshotPayload,
  RoundStartedPayload,
  RoundTickPayload,
  WsEnvelope,
} from '@/types/contract';

/**
 * Liga o socket.io ao estado da rodada. Registra os listeners server→client
 * (§5) e despacha cada evento para o `round.store`. Reconecta com o token
 * quando o usuário muda (para receber `bet:rejected` na room privada).
 *
 * Efeitos colaterais de UX (toasts, invalidação de saldo) ficam aqui, fora dos
 * componentes de apresentação.
 */
export function useGameSocket(): void {
  const accessToken = useAuthStore((s) => s.user?.accessToken ?? null);
  const userSub = useAuthStore((s) => s.user?.sub ?? null);
  const queryClient = useQueryClient();

  const applySnapshot = useRoundStore((s) => s.applySnapshot);
  const applyBettingStarted = useRoundStore((s) => s.applyBettingStarted);
  const applyStarted = useRoundStore((s) => s.applyStarted);
  const applyTick = useRoundStore((s) => s.applyTick);
  const applyCrashed = useRoundStore((s) => s.applyCrashed);
  const applyBetPlaced = useRoundStore((s) => s.applyBetPlaced);
  const applyBetCashedOut = useRoundStore((s) => s.applyBetCashedOut);
  const applyBetRejected = useRoundStore((s) => s.applyBetRejected);

  useEffect(() => {
    const socket = wsService.connect(accessToken);

    socket.on('round:snapshot', (e: WsEnvelope<RoundSnapshotPayload>) =>
      applySnapshot(e.payload),
    );
    socket.on('round:betting_started', (e: WsEnvelope<RoundBettingStartedPayload>) =>
      applyBettingStarted(e.payload, e.timestamp),
    );
    socket.on('round:started', (e: WsEnvelope<RoundStartedPayload>) =>
      applyStarted(e.payload),
    );
    socket.on('round:tick', (e: WsEnvelope<RoundTickPayload>) => applyTick(e.payload));
    socket.on('round:crashed', (e: WsEnvelope<RoundCrashedPayload>) => {
      applyCrashed(e.payload);
      // Saldo pode mudar na liquidação; revalida.
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['rounds', 'history'] });
    });
    socket.on('bet:placed', (e: WsEnvelope<BetPlacedPayload>) =>
      applyBetPlaced(e.payload),
    );
    socket.on('bet:cashed_out', (e: WsEnvelope<BetCashedOutPayload>) =>
      applyBetCashedOut(e.payload),
    );
    socket.on('bet:rejected', (e: WsEnvelope<BetRejectedPayload>) => {
      const reason = e.payload.reason;
      // Compensação na UI: remove a aposta otimista do próprio jogador.
      if (userSub) applyBetRejected(userSub);
      toast.error(
        reason === 'INSUFFICIENT_BALANCE'
          ? 'Saldo insuficiente — aposta rejeitada.'
          : `Aposta rejeitada: ${reason}`,
      );
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
    });

    return () => {
      socket.off();
      wsService.disconnect();
    };
  }, [
    accessToken,
    userSub,
    queryClient,
    applySnapshot,
    applyBettingStarted,
    applyStarted,
    applyTick,
    applyCrashed,
    applyBetPlaced,
    applyBetCashedOut,
    applyBetRejected,
  ]);
}
