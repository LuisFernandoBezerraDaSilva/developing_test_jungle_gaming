import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useWallet } from '@/hooks/useGameQueries';
import { useAuthStore } from '@/stores/auth.store';
import { formatCents } from '@/lib/money';
import { LogOut } from 'lucide-react';

/** Info do jogador: saldo em destaque + username (do JWT). */
export function PlayerInfo() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { data: wallet, isLoading } = useWallet();

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Jogador</CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => logout()}
          aria-label="Sair"
          className="text-muted-foreground"
        >
          <LogOut className="size-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-lg font-semibold">{user?.username ?? '—'}</p>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Saldo</p>
          {isLoading ? (
            <Skeleton className="mt-1 h-8 w-32" />
          ) : (
            <p className="text-3xl font-bold text-primary">
              {wallet ? formatCents(wallet.balanceCents) : 'R$ 0,00'}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
