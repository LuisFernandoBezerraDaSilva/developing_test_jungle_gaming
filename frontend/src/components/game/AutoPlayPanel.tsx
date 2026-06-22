import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSettingsStore } from '@/stores/settings.store';
import { cn } from '@/lib/utils';
import { Volume2, VolumeX } from 'lucide-react';

/**
 * Painel de configurações de jogo (bônus): som, auto-cashout e auto-bet.
 * Camada Component: apenas lê/escreve no settings store; a lógica de execução
 * vive no hook `useAutoPlay`.
 */
export function AutoPlayPanel() {
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const toggleSound = useSettingsStore((s) => s.toggleSound);
  const autoCashout = useSettingsStore((s) => s.autoCashout);
  const setAutoCashout = useSettingsStore((s) => s.setAutoCashout);
  const autoBet = useSettingsStore((s) => s.autoBet);
  const setAutoBet = useSettingsStore((s) => s.setAutoBet);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Automação</CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleSound}
          aria-label={soundEnabled ? 'Desativar som' : 'Ativar som'}
          aria-pressed={soundEnabled}
          className="text-muted-foreground"
        >
          {soundEnabled ? (
            <Volume2 className="size-4" />
          ) : (
            <VolumeX className="size-4" />
          )}
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Auto cashout */}
        <section className="space-y-2">
          <Toggle
            label="Auto Cash Out"
            checked={autoCashout.enabled}
            onChange={(enabled) => setAutoCashout({ enabled })}
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Alvo</span>
            <Input
              inputMode="decimal"
              value={autoCashout.target}
              onChange={(e) => setAutoCashout({ target: e.target.value })}
              className="h-9"
              aria-label="Multiplicador alvo do auto cashout"
            />
            <span className="text-xs text-muted-foreground">x</span>
          </div>
        </section>

        <div className="h-px bg-border" />

        {/* Auto bet */}
        <section className="space-y-2">
          <Toggle
            label="Auto Bet"
            checked={autoBet.enabled}
            onChange={(enabled) => setAutoBet({ enabled })}
          />

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Base R$</span>
            <Input
              inputMode="decimal"
              value={autoBet.baseAmount}
              onChange={(e) => setAutoBet({ baseAmount: e.target.value })}
              className="h-9"
              aria-label="Valor base do auto bet em reais"
            />
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant={autoBet.strategy === 'fixed' ? 'secondary' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => setAutoBet({ strategy: 'fixed' })}
            >
              Fixo
            </Button>
            <Button
              type="button"
              variant={autoBet.strategy === 'martingale' ? 'secondary' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => setAutoBet({ strategy: 'martingale' })}
            >
              Martingale
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Input
              inputMode="decimal"
              value={autoBet.stopProfit}
              onChange={(e) => setAutoBet({ stopProfit: e.target.value })}
              className="h-9"
              placeholder="Stop lucro R$"
              aria-label="Parar ao atingir lucro (reais)"
            />
            <Input
              inputMode="decimal"
              value={autoBet.stopLoss}
              onChange={(e) => setAutoBet({ stopLoss: e.target.value })}
              className="h-9"
              placeholder="Stop perda R$"
              aria-label="Parar ao atingir perda (reais)"
            />
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

/** Toggle simples (sem dependência extra), acessível por teclado. */
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between"
    >
      <span className="text-sm font-medium">{label}</span>
      <span
        className={cn(
          'relative h-6 w-11 rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-secondary',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-5 rounded-full bg-background transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  );
}
