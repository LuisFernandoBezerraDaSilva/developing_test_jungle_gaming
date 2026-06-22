import { describe, it, expect } from 'vitest';
import {
  formatCents,
  computePayoutCents,
  multiplierToCentesimos,
  centsToBigInt,
} from './money';

describe('money — precisão monetária (sem float)', () => {
  it('formata centavos como BRL', () => {
    expect(formatCents('10000')).toBe('R$ 100,00');
    expect(formatCents('100')).toBe('R$ 1,00');
    expect(formatCents('0')).toBe('R$ 0,00');
    expect(formatCents('5')).toBe('R$ 0,05');
  });

  it('agrupa milhares', () => {
    expect(formatCents('100000')).toBe('R$ 1.000,00');
    expect(formatCents('123456789')).toBe('R$ 1.234.567,89');
  });

  it('preserva precisão acima de 2^53', () => {
    // 9007199254740993 = 2^53 + 1, não representável exatamente como number JS
    const big = '900719925474099300';
    expect(formatCents(big)).toBe('R$ 9.007.199.254.740.993,00');
  });

  it('calcula payout por aritmética inteira com floor (§0)', () => {
    // 10000 centavos × 2.35 = 23500
    expect(computePayoutCents('10000', '2.35')).toBe('23500');
    // floor: 333 × 1.50 = 499.5 → 499
    expect(computePayoutCents('333', '1.50')).toBe('499');
    // 1x devolve o valor original
    expect(computePayoutCents('10000', '1.00')).toBe('10000');
  });

  it('converte multiplicador em centésimos sem float', () => {
    expect(multiplierToCentesimos('2.35')).toBe(235n);
    expect(multiplierToCentesimos('1.00')).toBe(100n);
    expect(multiplierToCentesimos('10')).toBe(1000n);
    expect(multiplierToCentesimos('4.2')).toBe(420n);
  });

  it('rejeita entradas inválidas', () => {
    expect(() => centsToBigInt('abc')).toThrow();
    expect(() => multiplierToCentesimos('x.yz')).toThrow();
  });
});
