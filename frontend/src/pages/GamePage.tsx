import { useEffect } from 'react';
import { CrashChart } from '@/components/game/CrashChart';
import { BetControls } from '@/components/game/BetControls';
import { BetsList } from '@/components/game/BetsList';
import { RoundHistory } from '@/components/game/RoundHistory';
import { PlayerInfo } from '@/components/game/PlayerInfo';
import { AutoPlayPanel } from '@/components/game/AutoPlayPanel';
import { Leaderboard } from '@/components/game/Leaderboard';
import { ProvablyFairDialog } from '@/components/game/ProvablyFairDialog';
import { useGameSocket } from '@/hooks/useGameSocket';
import { useAutoPlay } from '@/hooks/useAutoPlay';
import { useSoundEffects } from '@/hooks/useSoundEffects';
import { walletService } from '@/services/wallet.service';

/**
 * Página principal do jogo (camada Page): controla a composição da rota.
 * Liga o WebSocket (sincronização em tempo real) e garante a carteira do
 * jogador (POST /wallets é idempotente no backend).
 */
export function GamePage() {
  useGameSocket();
  useAutoPlay();
  useSoundEffects();

  useEffect(() => {
    // Garante a existência da carteira ao entrar no jogo (idempotente).
    walletService.create().catch(() => {
      /* já existe ou será exibido erro de saldo na query */
    });
  }, []);

  return (
    <div className="min-h-screen p-4">
      <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[1fr_20rem]">
        {/* Coluna principal */}
        <div className="flex flex-col gap-4">
          <CrashChart />
          <div className="flex justify-end">
            <ProvablyFairDialog />
          </div>
          <RoundHistory />
          <BetsList />
        </div>

        {/* Coluna lateral */}
        <div className="flex flex-col gap-4">
          <PlayerInfo />
          <BetControls />
          <AutoPlayPanel />
          <Leaderboard />
        </div>
      </div>
    </div>
  );
}
