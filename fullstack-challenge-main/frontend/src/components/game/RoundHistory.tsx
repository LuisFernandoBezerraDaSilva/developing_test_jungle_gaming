import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useRoundHistory } from '@/hooks/useGameQueries';
import { crashTier, formatMultiplier, type CrashTier } from '@/lib/multiplier';
import { cn } from '@/lib/utils';

const tierClass: Record<CrashTier, string> = {
  low: 'bg-destructive/15 text-destructive',
  mid: 'bg-warning/15 text-warning',
  high: 'bg-primary/15 text-primary',
};

/** Histórico dos últimos ~20 crash points, com código de cores. */
export function RoundHistory() {
  const { data, isLoading } = useRoundHistory(20);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Histórico</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-16" />
            ))}
          </div>
        ) : data && data.rounds.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {data.rounds.map((round) => (
              <span
                key={round.roundId}
                className={cn(
                  'rounded-md px-2 py-1 font-mono text-sm font-semibold',
                  tierClass[crashTier(round.crashMultiplier)],
                )}
                title={`${round.totalBets} apostas`}
              >
                {formatMultiplier(round.crashMultiplier)}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Sem rodadas ainda.</p>
        )}
      </CardContent>
    </Card>
  );
}
