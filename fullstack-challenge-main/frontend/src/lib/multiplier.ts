/**
 * Helpers de exibição do multiplicador. O valor é a fonte de verdade do
 * servidor (evento `round:tick`); aqui só formatamos e classificamos por cor —
 * NUNCA recalculamos o multiplicador localmente.
 */

/** Garante o formato "x.xx" para exibição (ex: "2.3" → "2.30x"). */
export function formatMultiplier(multiplier: string): string {
  const num = Number(multiplier);
  if (Number.isNaN(num)) return `${multiplier}x`;
  return `${num.toFixed(2)}x`;
}

/**
 * Classificação por faixa de crash, para o código de cores do histórico.
 * vermelho = crash baixo, verde = crash alto (requisito do desafio).
 */
export type CrashTier = 'low' | 'mid' | 'high';

export function crashTier(multiplier: string): CrashTier {
  const num = Number(multiplier);
  if (Number.isNaN(num) || num < 2) return 'low';
  if (num < 10) return 'mid';
  return 'high';
}
