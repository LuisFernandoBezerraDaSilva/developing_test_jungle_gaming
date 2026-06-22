import { describe, it, expect } from 'vitest';
import {
  nextBetAmountCents,
  shouldStopAutoBet,
  isWithinBetRange,
} from './autobet';

describe('autobet', () => {
  describe('nextBetAmountCents', () => {
    it('fixed strategy always returns the base amount', () => {
      expect(
        nextBetAmountCents({
          strategy: 'fixed',
          baseCents: 1000n,
          lastAmountCents: 8000n,
          lastWon: false,
        }),
      ).toBe(1000n);
    });

    it('martingale doubles after a loss', () => {
      expect(
        nextBetAmountCents({
          strategy: 'martingale',
          baseCents: 1000n,
          lastAmountCents: 2000n,
          lastWon: false,
        }),
      ).toBe(4000n);
    });

    it('martingale resets to base after a win', () => {
      expect(
        nextBetAmountCents({
          strategy: 'martingale',
          baseCents: 1000n,
          lastAmountCents: 8000n,
          lastWon: true,
        }),
      ).toBe(1000n);
    });
  });

  describe('shouldStopAutoBet', () => {
    it('does not stop with no limits set', () => {
      expect(
        shouldStopAutoBet({
          profitCents: -5000n,
          stopProfitCents: null,
          stopLossCents: null,
        }),
      ).toBe(false);
    });

    it('stops when profit target reached', () => {
      expect(
        shouldStopAutoBet({
          profitCents: 10000n,
          stopProfitCents: 10000n,
          stopLossCents: null,
        }),
      ).toBe(true);
    });

    it('stops when loss limit reached', () => {
      expect(
        shouldStopAutoBet({
          profitCents: -10000n,
          stopProfitCents: null,
          stopLossCents: 10000n,
        }),
      ).toBe(true);
    });
  });

  describe('isWithinBetRange', () => {
    it('accepts the boundaries', () => {
      expect(isWithinBetRange(100n)).toBe(true);
      expect(isWithinBetRange(100000n)).toBe(true);
    });

    it('rejects values outside 100–100000 cents', () => {
      expect(isWithinBetRange(99n)).toBe(false);
      expect(isWithinBetRange(100001n)).toBe(false);
    });
  });
});
