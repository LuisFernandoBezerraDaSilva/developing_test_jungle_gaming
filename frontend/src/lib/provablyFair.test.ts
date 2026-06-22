import { describe, it, expect } from 'vitest';
import {
  sha256Hex,
  hmacSha256Hex,
  calculateCrashPoint,
  verifyRound,
} from './provablyFair';

describe('provablyFair', () => {
  it('computes known SHA-256 vectors', async () => {
    expect(await sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('computes a known HMAC-SHA256 vector (RFC 4231 case 1)', async () => {
    // key = 20 bytes of 0x0b, message = "Hi There"
    const key = '\x0b'.repeat(20);
    expect(await hmacSha256Hex(key, 'Hi There')).toBe(
      'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7',
    );
  });

  it('returns a multiplier >= 1.00 with two decimals', async () => {
    const crash = await calculateCrashPoint('server-seed', 'client', 1);
    expect(crash).toMatch(/^\d+\.\d{2}$/);
    expect(Number(crash)).toBeGreaterThanOrEqual(1);
  });

  it('verifies a self-consistent revealed round (happy path)', async () => {
    const serverSeed = 'a'.repeat(64);
    const clientSeed = 'crash-game-public-seed';
    const nonce = 42;
    const serverHash = await sha256Hex(serverSeed);
    const expectedCrash = await calculateCrashPoint(serverSeed, clientSeed, nonce);

    const result = await verifyRound({
      serverSeed,
      serverHash,
      clientSeed,
      nonce,
      expectedCrash,
    });

    expect(result.hashMatches).toBe(true);
    expect(result.crashMatches).toBe(true);
  });

  it('flags a tampered hash / crash', async () => {
    const serverSeed = 'b'.repeat(64);
    const result = await verifyRound({
      serverSeed,
      serverHash: 'deadbeef',
      clientSeed: 'crash-game-public-seed',
      nonce: 1,
      expectedCrash: '999.99',
    });

    expect(result.hashMatches).toBe(false);
    expect(result.crashMatches).toBe(false);
  });
});
