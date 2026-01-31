
import { bench, describe } from 'vitest';
import { DivergenceScanner } from '../src/utils/divergenceScanner';

function generateData(count: number) {
  const priceHighs: number[] = [];
  const priceLows: number[] = [];
  const indicatorValues: number[] = [];

  let price = 100;
  let ind = 50;

  for (let i = 0; i < count; i++) {
    price += (Math.random() - 0.5) * 2;
    ind += (Math.random() - 0.5) * 5;
    // Keep indicator bounded
    if (ind > 100) ind = 90;
    if (ind < 0) ind = 10;

    priceHighs.push(price + Math.random());
    priceLows.push(price - Math.random());
    indicatorValues.push(ind);
  }
  return { priceHighs, priceLows, indicatorValues };
}

const data = generateData(5000);

describe('Divergence Scanner', () => {
  bench('scan', () => {
    DivergenceScanner.scan(
      data.priceHighs,
      data.priceLows,
      data.indicatorValues,
      'RSI'
    );
  });
});
