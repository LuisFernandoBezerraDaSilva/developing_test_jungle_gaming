import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useLeaderboard } from '@/hooks/useGameQueries';
import { formatCents } from '@/lib/money';
import { cn } from '@/lib/utils';

/** Top jogadores por lucro líquido (bônus). Alterna entre 24h e semana. */
export function Leaderboard() {
  const [period, setPeriod] = useState<'24h' | 'week'>('24h');
  const { data, isLoading } = useLeaderboard(period);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Leaderboard</CardTitle>
        <div className="flex gap-1 rounded-md bg-secondary/40 p-0.5 text-xs">
          {(['24h', 'week'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                'rounded px-2 py-1 font-medium transition-colors',
                period === p
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {p === '24h' ? '24h' : 'Semana'}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        ) : data && data.entries.length > 0 ? (
          <ol className="space-y-1">
            {data.entries.map((e) => {
              const profit = BigInt(e.profitCents);
              return (
                <li
                  key={e.playerId}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="flex items-center gap-2 truncate">
                    <span className="w-5 text-right font-mono text-muted-foreground">
                      {e.rank}
                    </span>
                    <span className="truncate">{e.username}</span>
                  </span>
                  <span
                    className={cn(
                      'font-mono font-semibold',
                      profit > 0n
                        ? 'text-primary'
                        : profit < 0n
                          ? 'text-destructive'
                          : 'text-muted-foreground',
                    )}
                  >
                    {profit > 0n ? '+' : ''}
                    {formatCents(e.profitCents)}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">Sem dados no período.</p>
        )}
      </CardContent>
    </Card>
  );
}
