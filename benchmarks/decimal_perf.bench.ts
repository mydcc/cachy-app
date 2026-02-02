
import { bench, describe } from 'vitest';
import { Decimal } from 'decimal.js';

describe('Decimal Conversion Performance', () => {
  const values = Array.from({ length: 10000 }, () => (Math.random() * 10000).toString());

  bench('new Decimal(str).toNumber()', () => {
    for (const val of values) {
      new Decimal(val).toNumber();
    }
  });

  bench('parseFloat(str)', () => {
    for (const val of values) {
      parseFloat(val);
    }
  });

  bench('Number(str)', () => {
    for (const val of values) {
      Number(val);
    }
  });
});
