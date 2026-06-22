/**
 * Verificação provably fair no cliente (transparência — bônus).
 *
 * Reimplementa de forma independente o algoritmo do CONTRACT.md §4 usando a
 * Web Crypto API, para que o jogador possa confirmar, sem confiar no servidor:
 *   1. SHA256(serverSeed) === serverHash (commit-reveal)
 *   2. calculateCrashPoint(serverSeed, clientSeed, nonce) === crashMultiplier
 *
 * O multiplicador NÃO é dinheiro, então uso de float aqui é aceitável (§4.1).
 */

const HOUSE_EDGE = 0.01;

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** SHA-256 de uma string UTF-8, em hex minúsculo. */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toHex(digest);
}

/** HMAC-SHA256 (key e message UTF-8), em hex minúsculo. */
export async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
  return toHex(signature);
}

/**
 * Recalcula o crash point a partir de (serverSeed, clientSeed, nonce).
 * Retorna "x.xx" (2 casas, floor), idêntico ao algoritmo do contrato.
 */
export async function calculateCrashPoint(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
): Promise<string> {
  const hmac = await hmacSha256Hex(serverSeed, `${clientSeed}:${nonce}`);
  const intValue = parseInt(hmac.substring(0, 8), 16);
  const e = 2 ** 32;
  const result = Math.floor((e / (e - intValue)) * (1 - HOUSE_EDGE) * 100) / 100;
  return Math.max(1.0, result).toFixed(2);
}

export type VerificationResult = {
  hashMatches: boolean;
  crashMatches: boolean;
  recomputedHash: string;
  recomputedCrash: string;
};

/**
 * Verifica uma rodada já revelada. `expectedCrash` deve estar normalizado em
 * "x.xx" (ex: o `crashMultiplier` do endpoint /verify).
 */
export async function verifyRound(params: {
  serverSeed: string;
  serverHash: string;
  clientSeed: string;
  nonce: number;
  expectedCrash: string;
}): Promise<VerificationResult> {
  const recomputedHash = await sha256Hex(params.serverSeed);
  const recomputedCrash = await calculateCrashPoint(
    params.serverSeed,
    params.clientSeed,
    params.nonce,
  );
  return {
    hashMatches: recomputedHash.toLowerCase() === params.serverHash.toLowerCase(),
    crashMatches: recomputedCrash === normalizeMultiplier(params.expectedCrash),
    recomputedHash,
    recomputedCrash,
  };
}

/** "2.4" → "2.40"; mantém precisão de centésimos para comparar. */
function normalizeMultiplier(multiplier: string): string {
  const num = Number(multiplier);
  return Number.isNaN(num) ? multiplier : num.toFixed(2);
}
