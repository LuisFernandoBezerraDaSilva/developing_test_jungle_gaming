import { useEffect, useState } from 'react';

/**
 * Countdown da fase de apostas. Deriva o tempo restante de
 * `phaseStartedAt + bettingWindowSeconds` — o servidor continua sendo a fonte
 * de verdade (recebemos `phaseStartedAt` do WS); aqui só interpolamos para a UI.
 */
export function useCountdown(
  phaseStartedAt: string | null,
  windowSeconds: number,
): number {
  const [remaining, setRemaining] = useState(() =>
    computeRemaining(phaseStartedAt, windowSeconds),
  );

  useEffect(() => {
    if (!phaseStartedAt || windowSeconds <= 0) return;

    const update = () => setRemaining(computeRemaining(phaseStartedAt, windowSeconds));
    update();
    const id = window.setInterval(update, 100);
    return () => window.clearInterval(id);
  }, [phaseStartedAt, windowSeconds]);

  return remaining;
}

function computeRemaining(phaseStartedAt: string | null, windowSeconds: number): number {
  if (!phaseStartedAt || windowSeconds <= 0) return 0;
  const end = new Date(phaseStartedAt).getTime() + windowSeconds * 1000;
  const ms = end - Date.now();
  return ms > 0 ? ms / 1000 : 0;
}
