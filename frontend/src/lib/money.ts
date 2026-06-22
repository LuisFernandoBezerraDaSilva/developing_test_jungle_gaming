/**
 * Aritmética e formatação monetária. Dinheiro do backend chega SEMPRE como
 * `string` de centavos (ex: "10000" = R$100,00). NUNCA converter para `number`
 * para cálculo — perda de precisão acima de 2^53 é motivo de desclassificação.
 * Toda matemática aqui usa BigInt.
 */

/** Converte string de centavos em BigInt com validação. */
export function centsToBigInt(amountCents: string): bigint {
  if (!/^-?\d+$/.test(amountCents.trim())) {
    throw new Error(`Valor de centavos inválido: "${amountCents}"`);
  }
  return BigInt(amountCents);
}

/**
 * Formata centavos (string) como moeda BRL para exibição, sem usar float.
 * Ex: "10000" → "R$ 100,00".
 */
export function formatCents(amountCents: string, currency = 'BRL'): string {
  const negative = amountCents.trim().startsWith('-');
  const cents = centsToBigInt(amountCents);
  const abs = cents < 0n ? -cents : cents;

  const whole = abs / 100n;
  const frac = abs % 100n;

  const wholeStr = groupThousands(whole.toString());
  const fracStr = frac.toString().padStart(2, '0');

  const symbol = currency === 'BRL' ? 'R$ ' : '';
  return `${negative ? '-' : ''}${symbol}${wholeStr},${fracStr}`;
}

/** Insere separador de milhar (.) em uma string de dígitos. */
function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Multiplica centavos por um multiplicador "x.xx" usando aritmética inteira.
 * payoutCents = floor(amountCents × multiplicadorCentésimos / 100). (§0)
 */
export function computePayoutCents(amountCents: string, multiplier: string): string {
  const amount = centsToBigInt(amountCents);
  const centesimos = multiplierToCentesimos(multiplier);
  return ((amount * centesimos) / 100n).toString();
}

/** "2.35" → 235n (centésimos inteiros), sem float. */
export function multiplierToCentesimos(multiplier: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(multiplier.trim());
  if (!match) {
    throw new Error(`Multiplicador inválido: "${multiplier}"`);
  }
  const whole = BigInt(match[1]);
  const fracRaw = (match[2] ?? '').padEnd(2, '0');
  return whole * 100n + BigInt(fracRaw);
}

/**
 * Converte um valor em reais digitado (ex: "10", "10.5", "10,50") em string de
 * centavos, sem float. Retorna null se a entrada for inválida.
 */
export function reaisToCents(input: string): string | null {
  const normalized = input.trim().replace(',', '.');
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) return null;
  const whole = BigInt(match[1]);
  const fracRaw = (match[2] ?? '').padEnd(2, '0');
  return (whole * 100n + BigInt(fracRaw)).toString();
}
