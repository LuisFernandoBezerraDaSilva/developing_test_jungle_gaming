import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { walletService } from '@/services/wallet.service';
import { gameService } from '@/services/game.service';
import { HttpError } from '@/services/http';
import { useAuthStore } from '@/stores/auth.store';
import type {
  CashoutResponse,
  PlaceBetResponse,
  RoundHistoryResponse,
  WalletResponse,
} from '@/types/contract';

/**
 * Hooks de server-state (TanStack Query). Encapsulam as chamadas da camada
 * Service e as regras de cache/revalidação para a UI.
 */

/** Carteira/saldo do jogador (auth). */
export function useWallet(): UseQueryResult<WalletResponse> {
  const isAuth = useAuthStore((s) => s.status === 'authenticated');
  return useQuery({
    queryKey: ['wallet'],
    queryFn: () => walletService.me(),
    enabled: isAuth,
    retry: false,
  });
}

/** Histórico de rodadas (~20 últimos crash points). */
export function useRoundHistory(limit = 20): UseQueryResult<RoundHistoryResponse> {
  return useQuery({
    queryKey: ['rounds', 'history', limit],
    queryFn: () => gameService.history(1, limit),
  });
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof HttpError ? error.message : fallback;
}

/** Apostar na rodada atual. */
export function usePlaceBet() {
  const queryClient = useQueryClient();
  return useMutation<PlaceBetResponse, unknown, string>({
    mutationFn: (amountCents: string) => gameService.placeBet(amountCents),
    onSuccess: () => {
      toast.success('Aposta registrada!');
      queryClient.invalidateQueries({ queryKey: ['bets', 'me'] });
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'Não foi possível apostar.'));
    },
  });
}

/** Sacar (cash out) no multiplicador atual. */
export function useCashout() {
  const queryClient = useQueryClient();
  return useMutation<CashoutResponse, unknown, void>({
    mutationFn: () => gameService.cashout(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'Não foi possível sacar.'));
    },
  });
}
