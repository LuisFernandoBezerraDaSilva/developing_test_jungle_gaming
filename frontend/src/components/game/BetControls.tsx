import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRoundStore } from '@/stores/round.store';
import { useAuthStore } from '@/stores/auth.store';
import { usePlaceBet, useCashout } from '@/hooks/useGameQueries';
import { useCountdown } from '@/hooks/useCountdown';
import { reaisToCents, formatCents, computePayoutCents, centsToBigInt } from '@/lib/money';
import { formatMultiplier } from '@/lib/multiplier';

const MIN_CENTS = 100n; // R$1,00
const MAX_CENTS = 100000n; // R$1.000,00

/**
 * Controles de aposta. "Apostar" habilita só na fase BETTING; "Cash Out" só em
 * RUNNING com aposta PENDING do próprio jogador, exibindo o payout potencial
 * (calculado por aritmética inteira sobre o multiplicador corrente do servidor).
 */
export function BetControls() {
  const phase = useRoundStore((s) => s.phase);
  const multiplier = useRoundStore((s) => s.multiplier);
  const bets = useRoundStore((s) => s.bets);
  const phaseStartedAt = useRoundStore((s) => s.phaseStartedAt);
  const bettingWindowSeconds = useRoundStore((s) => s.bettingWindowSeconds);
  const userSub = useAuthStore((s) => s.user?.sub ?? null);

  const placeBet = usePlaceBet();
  const cashout = useCashout();
  const countdown = useCountdown(phaseStartedAt, bettingWindowSeconds);

  const [amount, setAmount] = useState('10');

  const amountCents = reaisToCents(amount);
  const validationError = useMemo(() => {
    if (amountCents === null) return 'Valor inválido';
    const cents = centsToBigInt(amountCents);
    if (cents < MIN_CENTS || cents > MAX_CENTS) {
      return 'Aposta entre R$ 1,00 e R$ 1.000,00';
    }
    return null;
  }, [amountCents]);

  const myBet = userSub ? bets.find((b) => b.playerId === userSub) : undefined;
  const myPendingBet = myBet?.status === 'PENDING' ? myBet : undefined;

  const isBetting = phase === 'BETTING';
  const isRunning = phase === 'RUNNING';

  const potentialPayout =
    myPendingBet && isRunning
      ? computePayoutCents(myPendingBet.amountCents, multiplier)
      : null;

  const canBet = isBetting && !myBet && validationError === null && !placeBet.isPending;
  const canCashout = isRunning && !!myPendingBet && !cashout.isPending;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Aposta</CardTitle>
        {isBetting && (
          <span className="font-mono text-sm text-warning">
            {countdown.toFixed(1)}s
          </span>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={!isBetting || !!myBet}
            aria-label="Valor da aposta em reais"
            placeholder="0,00"
          />
          {isBetting && validationError && !myBet && (
            <p className="text-xs text-destructive">{validationError}</p>
          )}
        </div>

        {canCashout ? (
          <Button
            variant="accent"
            size="lg"
            className="w-full"
            onClick={() => cashout.mutate()}
            disabled={!canCashout}
          >
            Cash Out
            {potentialPayout && (
              <span className="font-mono">
                {formatCents(potentialPayout)} @ {formatMultiplier(multiplier)}
              </span>
            )}
          </Button>
        ) : (
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={() => amountCents && placeBet.mutate(amountCents)}
            disabled={!canBet}
          >
            {myBet ? 'Aposta registrada' : 'Apostar'}
          </Button>
        )}

        {myBet && (
          <p className="text-center text-xs text-muted-foreground">
            Sua aposta: {formatCents(myBet.amountCents)} · {myBet.status}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
