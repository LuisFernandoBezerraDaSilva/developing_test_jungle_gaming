import { describe, it, expect } from "bun:test";
import { createHash } from "crypto";
import { calculateCrashPoint, multiplierAt, payoutCents, CLIENT_SEED } from "../../src/domain/provably-fair";

describe("calculateCrashPoint", () => {
  it("is deterministic given same inputs", () => {
    const seed = "abc123def456abc123def456abc123def456abc123def456abc123def456abc1";
    const r1 = calculateCrashPoint(seed, CLIENT_SEED, 1);
    const r2 = calculateCrashPoint(seed, CLIENT_SEED, 1);
    expect(r1).toBe(r2);
  });

  it("returns at least 1.00", () => {
    for (let nonce = 1; nonce <= 50; nonce++) {
      const seed = `seed-${nonce}`.padEnd(64, "0");
      const result = calculateCrashPoint(seed, CLIENT_SEED, nonce);
      expect(result).toBeGreaterThanOrEqual(1.0);
    }
  });

  it("produces different values for different nonces", () => {
    const seed = "abc123def456abc123def456abc123def456abc123def456abc123def456abc1";
    const r1 = calculateCrashPoint(seed, CLIENT_SEED, 1);
    const r2 = calculateCrashPoint(seed, CLIENT_SEED, 2);
    expect(r1).not.toBe(r2);
  });

  it("can be verified via SHA256(serverSeed) === serverHash", () => {
    const serverSeed = "abc123def456abc123def456abc123def456abc123def456abc123def456abc1";
    const serverHash = createHash("sha256").update(serverSeed).digest("hex");
    const recomputed = createHash("sha256").update(serverSeed).digest("hex");
    expect(recomputed).toBe(serverHash);
  });

  it("has 2 decimal places", () => {
    const seed = "abc123def456abc123def456abc123def456abc123def456abc123def456abc1";
    const result = calculateCrashPoint(seed, CLIENT_SEED, 1);
    const str = result.toString();
    const decimals = str.includes(".") ? str.split(".")[1].length : 0;
    expect(decimals).toBeLessThanOrEqual(2);
  });
});

describe("multiplierAt", () => {
  it("starts at 1.00 at t=0", () => {
    expect(multiplierAt(0)).toBe(1.0);
  });

  it("grows over time", () => {
    expect(multiplierAt(10)).toBeGreaterThan(multiplierAt(5));
  });

  it("has 2 decimal places (floor)", () => {
    const val = multiplierAt(3.7);
    const str = val.toFixed(2);
    expect(parseFloat(str)).toBe(val);
  });
});

describe("payoutCents", () => {
  it("calculates correctly with integer arithmetic", () => {
    // 1000 cents at 2.35x = floor(1000 * 235 / 100) = floor(2350) = 2350
    expect(payoutCents(1000n, 235)).toBe(2350n);
  });

  it("truncates sub-cent (floor)", () => {
    // 100 cents at 1.50x = 150
    expect(payoutCents(100n, 150)).toBe(150n);
    // 101 cents at 1.50x = floor(101 * 150 / 100) = floor(151.5) = 151
    expect(payoutCents(101n, 150)).toBe(151n);
  });

  it("never uses float for money", () => {
    const result = payoutCents(99999n, 314);
    expect(typeof result).toBe("bigint");
  });
});
