import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { useRoundStore } from '@/stores/round.store';
import { formatMultiplier } from '@/lib/multiplier';
import { cn } from '@/lib/utils';

/**
 * Gráfico do crash. O multiplicador exibido é SEMPRE o recebido do servidor via
 * `round:tick` (store) — nunca recalculado localmente. A curva é apenas uma
 * representação visual derivada do valor corrente.
 */
export function CrashChart() {
  const phase = useRoundStore((s) => s.phase);
  const multiplier = useRoundStore((s) => s.multiplier);
  const serverHash = useRoundStore((s) => s.serverHash);
  const crash = useRoundStore((s) => s.crash);

  const value = Number(multiplier) || 1;
  const isRunning = phase === 'RUNNING';
  const isCrashed = phase === 'CRASHED';

  // Curva visual: amostra e^(k·t) normalizada até o multiplicador atual.
  const path = useMemo(() => buildCurve(value), [value]);

  return (
    <Card
      className={cn(
        'relative flex aspect-video w-full items-center justify-center overflow-hidden',
        isCrashed && 'animate-pulse border-destructive',
      )}
    >
      <svg
        viewBox="0 0 100 60"
        preserveAspectRatio="none"
        className="absolute inset-0 size-full opacity-80"
      >
        <defs>
          <linearGradient id="curveGrad" x1="0" y1="0" x2="1" y2="0">
            <stop
              offset="0%"
              stopColor={isCrashed ? 'var(--color-destructive)' : 'var(--color-primary)'}
              stopOpacity="0.2"
            />
            <stop
              offset="100%"
              stopColor={isCrashed ? 'var(--color-destructive)' : 'var(--color-primary)'}
            />
          </linearGradient>
        </defs>
        <path
          d={path}
          fill="none"
          stroke="url(#curveGrad)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>

      <div className="relative z-10 flex flex-col items-center gap-2 text-center">
        <span
          className={cn(
            'font-mono text-6xl font-bold tabular-nums transition-colors sm:text-7xl',
            isCrashed ? 'text-destructive' : isRunning ? 'text-primary' : 'text-foreground',
          )}
        >
          {formatMultiplier(multiplier)}
        </span>

        {phase === 'BETTING' && (
          <span className="text-sm uppercase tracking-widest text-muted-foreground">
            Apostas abertas
          </span>
        )}
        {isCrashed && (
          <span className="text-lg font-semibold uppercase tracking-widest text-destructive">
            Crash!
          </span>
        )}

        {/* Provably fair: serverHash publicado ANTES do crash. */}
        {serverHash && (
          <p className="mt-2 max-w-[28rem] truncate px-4 text-xs text-muted-foreground">
            <span className="opacity-70">serverHash:</span>{' '}
            <span className="font-mono">{serverHash}</span>
          </p>
        )}
        {crash?.serverSeed && (
          <p className="max-w-[28rem] truncate px-4 text-xs text-muted-foreground">
            <span className="opacity-70">serverSeed:</span>{' '}
            <span className="font-mono">{crash.serverSeed}</span>
          </p>
        )}

        {/* Bônus: fórmula da curva exposta (transparência provably fair). */}
        <p className="mt-1 text-[10px] text-muted-foreground/70">
          curva: multiplier(t) = ⌊e^(k·t) × 100⌋ / 100
        </p>
      </div>
    </Card>
  );
}

/** Gera um path SVG aproximando a subida exponencial até o multiplicador atual. */
function buildCurve(multiplier: number): string {
  const clamped = Math.min(Math.max(multiplier, 1), 50);
  const progress = Math.log(clamped) / Math.log(50); // 0..1 em escala log
  const points: string[] = [];
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * progress;
    const x = (i / steps) * 100;
    const y = 60 - (Math.exp(3 * t) - 1) / (Math.exp(3 * progress) - 1 || 1) * 55;
    points.push(`${x.toFixed(2)},${Number.isFinite(y) ? y.toFixed(2) : '60'}`);
  }
  return `M ${points.join(' L ')}`;
}
