/**
 * Value Object de dinheiro. Imutável, em centavos inteiros (BigInt) — nunca
 * float (regra inegociável do projeto). Igualdade por valor, não por referência.
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

  isPositive(): boolean {
    return this.cents > 0n;
  }

  isLessThan(other: Money): boolean {
    return this.cents < other.cents;
  }

  add(other: Money): Money {
    return new Money(this.cents + other.cents);
  }

  subtract(other: Money): Money {
    return new Money(this.cents - other.cents);
  }

  equals(other: Money): boolean {
    return this.cents === other.cents;
  }

  /** Serializa como string (evita perda de precisão acima de 2^53 no JSON). */
  toString(): string {
    return this.cents.toString();
  }
}
