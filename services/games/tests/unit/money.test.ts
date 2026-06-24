import { describe, it, expect } from "bun:test";
import { Money } from "../../src/domain/money";

describe("Money (value object)", () => {
  it("soma em centavos inteiros (BigInt) e é imutável", () => {
    const a = Money.fromCents(10000n);
    expect(a.add(Money.fromCents(2500n)).centsValue).toBe(12500n);
    expect(a.centsValue).toBe(10000n); // inalterado
  });

  it("igualdade por valor", () => {
    expect(Money.fromCents(500n).equals(Money.fromCents(500n))).toBe(true);
    expect(Money.fromCents(500n).equals(Money.fromCents(501n))).toBe(false);
  });

  it("applyMultiplier: payout = floor(cents × centésimos / 100) sem float", () => {
    // 100,00 @ 2.35x = floor(10000 × 235 / 100) = 23500
    expect(Money.fromCents(10000n).applyMultiplier(235).centsValue).toBe(23500n);
    // trunca sub-centavo: 101 @ 1.50x = floor(101 × 150 / 100) = 151
    expect(Money.fromCents(101n).applyMultiplier(150).centsValue).toBe(151n);
    expect(typeof Money.fromCents(1n).applyMultiplier(200).centsValue).toBe("bigint");
  });

  it("serializa como string", () => {
    expect(Money.fromCents(999999999999n).toString()).toBe("999999999999");
  });
});
