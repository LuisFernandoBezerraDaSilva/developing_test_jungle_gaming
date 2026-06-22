import { useEffect } from 'react';
import { CrashChart } from '@/components/game/CrashChart';
import { BetControls } from '@/components/game/BetControls';
import { BetsList } from '@/components/game/BetsList';
import { RoundHistory } from '@/components/game/RoundHistory';
import { PlayerInfo } from '@/components/game/PlayerInfo';
import { useGameSocket } from '@/hooks/useGameSocket';
import { walletService } from '@/services/wallet.service';

/**
 * Página principal do jogo (camada Page): controla a composição da rota.
 * Liga o WebSocket (sincronização em tempo real) e garante a carteira do
 * jogador (POST /wallets é idempotente no backend).
 */
export function GamePage() {
  useGameSocket();

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
          <RoundHistory />
          <BetsList />
        </div>

        {/* Coluna lateral */}
        <div className="flex flex-col gap-4">
          <PlayerInfo />
          <BetControls />
        </div>
      </div>
    </div>
  );
}
