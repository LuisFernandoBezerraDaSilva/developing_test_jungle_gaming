import { createHmac } from "crypto";

export const CLIENT_SEED = "crash-game-public-seed";
export const HOUSE_EDGE = 0.01;

export function calculateCrashPoint(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
): number {
  const hmac = createHmac("sha256", serverSeed)
    .update(`${clientSeed}:${nonce}`)
    .digest("hex");

  const intValue = parseInt(hmac.substring(0, 8), 16);
  const e = 2 ** 32;
  const result = Math.floor((e / (e - intValue)) * (1 - HOUSE_EDGE) * 100) / 100;

  return Math.max(1.0, result);
}

export function multiplierAt(t: number, k = 0.06): number {
  return Math.floor(Math.exp(k * t) * 100) / 100;
}

// crashMultiplier as integer centesimos (e.g. 2.35 → 235)
export function multiplierToCentesimos(multiplier: number): number {
  return Math.round(multiplier * 100);
}

export function payoutCents(amountCents: bigint, cashoutMultiplierCentesimos: number): bigint {
  return (amountCents * BigInt(cashoutMultiplierCentesimos)) / 100n;
}
