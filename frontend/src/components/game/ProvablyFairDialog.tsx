import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRoundStore } from '@/stores/round.store';
import { gameService } from '@/services/game.service';
import { verifyRound, type VerificationResult } from '@/lib/provablyFair';
import { ShieldCheck, X } from 'lucide-react';

/**
 * Diálogo de verificação provably fair (bônus). Componente autocontido: um
 * botão-gatilho + modal em overlay. Permite ao jogador confirmar, de forma
 * independente do servidor, o hash da seed e o crash point de uma rodada.
 */
export function ProvablyFairDialog() {
  const lastCrashedRoundId = useRoundStore((s) => s.crash?.roundId ?? null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-2"
      >
        <ShieldCheck className="size-4" />
        Verificar rodada
      </Button>
      {open && (
        <VerifyModal
          defaultRoundId={lastCrashedRoundId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function VerifyModal({
  defaultRoundId,
  onClose,
}: {
  defaultRoundId: string | null;
  onClose: () => void;
}) {
  const [roundId, setRoundId] = useState(defaultRoundId ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleVerify() {
    if (!roundId.trim()) {
      setError('Informe o ID da rodada.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const reveal = await gameService.verify(roundId.trim());
      const verification = await verifyRound({
        serverSeed: reveal.serverSeed,
        serverHash: reveal.serverHash,
        clientSeed: reveal.clientSeed,
        nonce: reveal.nonce,
        expectedCrash: reveal.crashMultiplier,
      });
      setResult(verification);
    } catch {
      setError('Não foi possível obter os dados da rodada.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Verificação provably fair"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <ShieldCheck className="size-5 text-primary" />
            Provably Fair
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X className="size-4" />
          </Button>
        </div>

        <p className="mb-4 text-sm text-muted-foreground">
          Recalculamos no seu navegador o hash da seed e o crash point para
          confirmar que a rodada não foi adulterada.
        </p>

        <div className="flex gap-2">
          <Input
            value={roundId}
            onChange={(e) => setRoundId(e.target.value)}
            placeholder="ID da rodada"
            aria-label="ID da rodada"
          />
          <Button onClick={handleVerify} disabled={loading}>
            {loading ? 'Verificando…' : 'Verificar'}
          </Button>
        </div>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        {result && (
          <div className="mt-4 space-y-2 text-sm">
            <ResultRow label="Hash da seed confere" ok={result.hashMatches} />
            <ResultRow label="Crash point confere" ok={result.crashMatches} />
            <dl className="mt-3 space-y-1 rounded-lg bg-secondary/40 p-3 font-mono text-xs">
              <Detail label="Hash recalculado" value={result.recomputedHash} />
              <Detail label="Crash recalculado" value={`${result.recomputedCrash}x`} />
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}

function ResultRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span className={ok ? 'font-semibold text-emerald-400' : 'font-semibold text-destructive'}>
        {ok ? '✓ OK' : '✗ Falhou'}
      </span>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-all">{value}</dd>
    </div>
  );
}
