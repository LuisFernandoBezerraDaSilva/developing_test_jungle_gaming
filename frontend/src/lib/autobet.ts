/**
 * Regras puras do auto-bet (bônus). Todo cálculo de valor é em centavos
 * inteiros (BigInt) — sem float em dinheiro (regra inegociável do projeto).
 */

export type AutoBetStrategy = 'fixed' | 'martingale';

/**
 * Próximo valor de aposta (em centavos) conforme a estratégia.
 * - `fixed`: sempre o valor base.
 * - `martingale`: dobra após perda, volta ao base após vitória.
 */
export function nextBetAmountCents(opts: {
  strategy: AutoBetStrategy;
  baseCents: bigint;
  lastAmountCents: bigint;
  lastWon: boolean;
}): bigint {
  if (opts.strategy === 'fixed') return opts.baseCents;
  return opts.lastWon ? opts.baseCents : opts.lastAmountCents * 2n;
}

/**
 * Decide se o auto-bet deve parar com base no lucro acumulado da sessão.
 * `stopProfitCents`/`stopLossCents` em null = sem limite. `stopLossCents` é um
 * valor positivo representando a perda máxima tolerada.
 */
export function shouldStopAutoBet(opts: {
  profitCents: bigint;
  stopProfitCents: bigint | null;
  stopLossCents: bigint | null;
}): boolean {
  if (opts.stopProfitCents !== null && opts.profitCents >= opts.stopProfitCents) {
    return true;
  }
  if (opts.stopLossCents !== null && opts.profitCents <= -opts.stopLossCents) {
    return true;
  }
  return false;
}

/** Garante o valor dentro do range permitido (100–100000 centavos). */
export function isWithinBetRange(amountCents: bigint): boolean {
  return amountCents >= 100n && amountCents <= 100000n;
}
