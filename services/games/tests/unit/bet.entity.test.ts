import { describe, it, expect } from "bun:test";
import { Bet, BetStatus } from "../../src/domain/bet.entity";

function makeBet(status: BetStatus = "PENDING", amountCents = 10000n): Bet {
  return new Bet({
    id: "bet-1",
    roundId: "round-1",
    playerId: "player-1",
    amountCents,
    status,
    cashoutMultiplier: null,
    payoutCents: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe("Bet.cashout", () => {
  it("moves PENDING → CASHED_OUT and locks multiplier + payout", () => {
    const bet = makeBet("PENDING", 10000n);
    bet.cashout("2.35", 23500n); // 100,00 @ 2.35x
    expect(bet.status).toBe("CASHED_OUT");
    expect(bet.cashoutMultiplier).toBe("2.35");
    expect(bet.payoutCents).toBe(23500n);
  });

  it("throws when cashing out a bet that is not PENDING", () => {
    expect(() => makeBet("CASHED_OUT").cashout("2.00", 20000n)).toThrow("Bet is not PENDING");
    expect(() => makeBet("WON").cashout("2.00", 20000n)).toThrow();
    expect(() => makeBet("LOST").cashout("2.00", 20000n)).toThrow();
    expect(() => makeBet("REJECTED").cashout("2.00", 20000n)).toThrow();
  });

  it("keeps payoutCents as bigint (never float)", () => {
    const bet = makeBet("PENDING", 99999n);
    bet.cashout("3.14", 313996n);
    expect(typeof bet.payoutCents).toBe("bigint");
  });
});

describe("Bet.settle", () => {
  it("settles a CASHED_OUT bet as WON (payout already locked at cashout)", () => {
    const bet = makeBet("PENDING", 10000n);
    bet.cashout("2.00", 20000n);
    bet.settle("WON", 20000n);
    expect(bet.status).toBe("WON");
    expect(bet.payoutCents).toBe(20000n); // preservado do cashout
  });

  it("settles a still-PENDING bet as LOST with zero payout", () => {
    const bet = makeBet("PENDING", 10000n);
    bet.settle("LOST", 0n);
    expect(bet.status).toBe("LOST");
    expect(bet.payoutCents).toBe(0n);
  });

  it("ignores the outcome arg for CASHED_OUT bets (always WON)", () => {
    const bet = makeBet("PENDING", 10000n);
    bet.cashout("2.00", 20000n);
    bet.settle("LOST", 0n); // mesmo passando LOST, cashout vira WON
    expect(bet.status).toBe("WON");
    expect(bet.payoutCents).toBe(20000n);
  });

  it("throws when settling a bet that is already terminal", () => {
    expect(() => makeBet("WON").settle("WON", 0n)).toThrow();
    expect(() => makeBet("LOST").settle("LOST", 0n)).toThrow();
    expect(() => makeBet("REJECTED").settle("LOST", 0n)).toThrow();
  });
});

describe("Bet.reject", () => {
  it("moves PENDING → REJECTED (compensação da saga)", () => {
    const bet = makeBet("PENDING");
    bet.reject();
    expect(bet.status).toBe("REJECTED");
  });

  it("throws when rejecting a bet that is not PENDING", () => {
    expect(() => makeBet("CASHED_OUT").reject()).toThrow("Bet is not PENDING");
    expect(() => makeBet("WON").reject()).toThrow();
  });
});

