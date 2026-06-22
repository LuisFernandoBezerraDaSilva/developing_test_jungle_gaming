import { describe, it, expect } from "bun:test";
import { Wallet, InsufficientBalanceError } from "../../src/domain/wallet.entity";

function makeWallet(balanceCents: bigint): Wallet {
  return new Wallet({
    id: "uuid-1",
    playerId: "player-1",
    balanceCents,
    currency: "BRL",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe("Wallet", () => {
  it("credits correctly", () => {
    const w = makeWallet(1000n);
    w.credit(500n);
    expect(w.balanceCents).toBe(1500n);
  });

  it("debits correctly", () => {
    const w = makeWallet(1000n);
    w.debit(300n);
    expect(w.balanceCents).toBe(700n);
  });

  it("throws InsufficientBalanceError when debit > balance", () => {
    const w = makeWallet(100n);
    expect(() => w.debit(101n)).toThrow(InsufficientBalanceError);
  });

  it("allows debit equal to balance (zeroes out)", () => {
    const w = makeWallet(500n);
    w.debit(500n);
    expect(w.balanceCents).toBe(0n);
  });

  it("never allows balance below zero", () => {
    const w = makeWallet(0n);
    expect(() => w.debit(1n)).toThrow(InsufficientBalanceError);
  });

  it("serializes balanceCents as string in toJSON", () => {
    const w = makeWallet(999999999999n);
    const json = w.toJSON();
    expect(typeof json.balanceCents).toBe("string");
    expect(json.balanceCents).toBe("999999999999");
  });

  it("rejects non-positive debit", () => {
    const w = makeWallet(1000n);
    expect(() => w.debit(0n)).toThrow();
  });

  it("rejects non-positive credit", () => {
    const w = makeWallet(1000n);
    expect(() => w.credit(0n)).toThrow();
  });
});
