import { describe, it, expect } from "bun:test";
import { Round } from "../../src/domain/round.entity";
import { Bet } from "../../src/domain/bet.entity";

function makeRound(phase: "BETTING" | "RUNNING" = "BETTING"): Round {
  const round = new Round({
    id: "round-1",
    phase: "BETTING",
    serverSeed: "seed".padEnd(64, "0"),
    serverHash: "hash".padEnd(64, "0"),
    clientSeed: "crash-game-public-seed",
    nonce: 1,
    crashMultiplier: null,
    phaseStartedAt: new Date(),
    crashedAt: null,
    settledAt: null,
    createdAt: new Date(),
    bets: [],
  });
  if (phase === "RUNNING") round.startRunning();
  return round;
}

function makeBet(playerId: string, amountCents = 1000n): Bet {
  return new Bet({
    id: `bet-${playerId}`,
    roundId: "round-1",
    playerId,
    amountCents,
    status: "PENDING",
    cashoutMultiplier: null,
    payoutCents: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe("Round state machine", () => {
  it("starts in BETTING phase", () => {
    expect(makeRound().phase).toBe("BETTING");
  });

  it("transitions BETTING → RUNNING", () => {
    const round = makeRound();
    round.startRunning();
    expect(round.phase).toBe("RUNNING");
  });

  it("transitions RUNNING → CRASHED", () => {
    const round = makeRound("RUNNING");
    round.crash("2.50");
    expect(round.phase).toBe("CRASHED");
    expect(round.crashMultiplier).toBe("2.50");
  });

  it("transitions CRASHED → SETTLED", () => {
    const round = makeRound("RUNNING");
    round.crash("1.00");
    round.settle();
    expect(round.phase).toBe("SETTLED");
  });

  it("throws when transitioning out of order", () => {
    const round = makeRound();
    expect(() => round.crash("1.00")).toThrow();
    expect(() => round.settle()).toThrow();
  });
});

describe("Bet lifecycle in Round", () => {
  it("accepts bet during BETTING phase", () => {
    const round = makeRound();
    const bet = makeBet("player-1");
    round.placeBet(bet);
    expect(round.bets.length).toBe(1);
  });

  it("rejects duplicate bet from same player", () => {
    const round = makeRound();
    round.placeBet(makeBet("player-1"));
    expect(() => round.placeBet(makeBet("player-1"))).toThrow("BET_ALREADY_PLACED");
  });

  it("rejects bet during RUNNING phase", () => {
    const round = makeRound("RUNNING");
    expect(() => round.placeBet(makeBet("player-1"))).toThrow("ROUND_NOT_IN_BETTING_PHASE");
  });

  it("settles PENDING bets as LOST after crash", () => {
    const round = makeRound("RUNNING");
    const bet = makeBet("player-1");
    // Manually insert bet into running round using internal access
    (round as any)._bets.set("player-1", bet);
    round.crash("1.50");
    round.settle();
    expect(bet.status).toBe("LOST");
    expect(bet.payoutCents).toBe(0n);
  });

  it("settles CASHED_OUT bets as WON", () => {
    const round = makeRound("RUNNING");
    const bet = makeBet("player-1", 1000n);
    (round as any)._bets.set("player-1", bet);

    bet.cashout("2.00", 2000n);
    round.crash("3.00");
    round.settle();
    expect(bet.status).toBe("WON");
  });

  it("rejectBet removes bet from active list", () => {
    const round = makeRound();
    round.placeBet(makeBet("player-1"));
    round.rejectBet("bet-player-1");
    expect(round.bets.length).toBe(0);
  });
});
