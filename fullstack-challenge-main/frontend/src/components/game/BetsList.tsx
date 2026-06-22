import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useRoundStore } from '@/stores/round.store';
import { formatCents } from '@/lib/money';
import { formatMultiplier } from '@/lib/multiplier';
import { cn } from '@/lib/utils';
import type { BetStatus } from '@/types/contract';

const statusLabel: Record<BetStatus, string> = {
  PENDING: 'Apostou',
  CASHED_OUT: 'Sacou',
  WON: 'Ganhou',
  LOST: 'Perdeu',
  REJECTED: 'Rejeitada',
};

/** Apostas da rodada atual em tempo real (username, valor, status). */
export function BetsList() {
  const bets = useRoundStore((s) => s.bets);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Apostas da rodada</CardTitle>
        <span className="text-xs text-muted-foreground">{bets.length}</span>
      </CardHeader>
      <CardContent className="flex-1 space-y-1 overflow-y-auto">
        {bets.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhuma aposta ainda.
          </p>
        ) : (
          bets.map((bet) => {
            const cashed = bet.status === 'CASHED_OUT' || bet.status === 'WON';
            return (
              <div
                key={bet.playerId}
                className={cn(
                  'flex items-center justify-between rounded-md px-2 py-1.5 text-sm',
                  cashed ? 'bg-primary/10' : 'bg-secondary/40',
                )}
              >
                <span className="truncate font-medium">{bet.username}</span>
                <span className="flex items-center gap-2">
                  <span className="font-mono text-muted-foreground">
                    {formatCents(bet.amountCents)}
                  </span>
                  {cashed && bet.cashoutMultiplier ? (
                    <span className="font-mono font-semibold text-primary">
                      {formatMultiplier(bet.cashoutMultiplier)}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {statusLabel[bet.status]}
                    </span>
                  )}
                </span>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
