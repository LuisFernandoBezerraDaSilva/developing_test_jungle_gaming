import { payoutCents as computePayout } from "./provably-fair";

/**
 * Value Object de dinheiro. Imutável, em centavos inteiros (BigInt) — nunca
 * float (regra inegociável do projeto). Igualdade por valor.
 *
 * Cada bounded context tem o seu Money (os serviços têm builds Docker isolados,
 * então um pacote compartilhado quebraria o `bun install` por serviço).
 */
export class Money {
  private constructor(private readonly cents: bigint) {}

  static fromCents(cents: bigint): Money {
    return new Money(cents);
  }

  static zero(): Money {
    return new Money(0n);
  }

  /** Valor em centavos (para persistência/serialização). */
  get centsValue(): bigint {
    return this.cents;
  }

  add(other: Money): Money {
    return new Money(this.cents + other.cents);
  }

  equals(other: Money): boolean {
    return this.cents === other.cents;
  }

  /**
   * Payout do cashout = floor(cents × multiplicadorCentésimos / 100), em
   * aritmética inteira (CONTRACT §0). Multiplicador como inteiro de centésimos
   * (ex: 2.35 → 235).
   */
  applyMultiplier(multiplierCentesimos: number): Money {
    return new Money(computePayout(this.cents, multiplierCentesimos));
  }

  /** Serializa como string (evita perda de precisão acima de 2^53 no JSON). */
  toString(): string {
    return this.cents.toString();
  }
}
