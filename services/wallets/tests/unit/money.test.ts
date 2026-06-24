import { describe, it, expect } from "bun:test";
import { Money } from "../../src/domain/money";

describe("Money (value object)", () => {
  it("soma e subtrai em centavos inteiros (BigInt)", () => {
    const a = Money.fromCents(10000n);
    const b = Money.fromCents(2500n);
    expect(a.add(b).centsValue).toBe(12500n);
    expect(a.subtract(b).centsValue).toBe(7500n);
  });

  it("é imutável — operações retornam novas instâncias", () => {
    const a = Money.fromCents(10000n);
    a.add(Money.fromCents(1n));
    expect(a.centsValue).toBe(10000n); // inalterado
  });

  it("igualdade por valor", () => {
    expect(Money.fromCents(500n).equals(Money.fromCents(500n))).toBe(true);
    expect(Money.fromCents(500n).equals(Money.fromCents(501n))).toBe(false);
  });

  it("isLessThan / isPositive", () => {
    expect(Money.fromCents(100n).isLessThan(Money.fromCents(101n))).toBe(true);
    expect(Money.fromCents(101n).isLessThan(Money.fromCents(100n))).toBe(false);
    expect(Money.fromCents(1n).isPositive()).toBe(true);
    expect(Money.zero().isPositive()).toBe(false);
  });

  it("serializa como string (sem perda de precisão acima de 2^53)", () => {
    const big = Money.fromCents(999999999999n);
    expect(big.toString()).toBe("999999999999");
    expect(typeof big.toString()).toBe("string");
  });
});
