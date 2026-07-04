import { negate, sumCents, toCents } from './money';

describe('money', () => {
  describe('toCents', () => {
    it.each([
      ['0', 0n],
      ['5000.00', 500000n],
      ['999.99', 99999n],
      ['0.01', 1n],
      ['-1500.00', -150000n],
      ['1000', 100000n],
      ['0.1', 10n],
    ])('%s → %s cents', (input, expected) => {
      expect(toCents(input)).toBe(expected);
    });
  });

  describe('sumCents', () => {
    it('un journal balanceado suma cero', () => {
      expect(sumCents(['-5000.00', '5000.00'])).toBe(0n);
      expect(sumCents(['-1500.00', '1500.00'])).toBe(0n);
    });

    it('un journal desbalanceado NO suma cero', () => {
      expect(sumCents(['-5000.00', '4999.99'])).toBe(-1n);
    });
  });

  describe('negate', () => {
    it('invierte el signo', () => {
      expect(negate('5000.00')).toBe('-5000.00');
      expect(negate('-5000.00')).toBe('5000.00');
    });
  });
});
