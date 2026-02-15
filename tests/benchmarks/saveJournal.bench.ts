import { bench, describe } from 'vitest';
import { Decimal } from 'decimal.js';
import { serializationService } from '../../src/services/serializationService';

// Mock JournalEntry
interface JournalEntry {
  id: number;
  date: string;
  symbol: string;
  entryPrice: Decimal;
  exitPrice: Decimal;
  targets: Array<{ price: Decimal; percent: Decimal }>;
  notes: string;
}

const generateJournal = (count: number): JournalEntry[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    date: new Date().toISOString(),
    symbol: 'BTCUSDT',
    entryPrice: new Decimal(Math.random() * 100000),
    exitPrice: new Decimal(Math.random() * 100000),
    targets: [
      { price: new Decimal(Math.random() * 100000), percent: new Decimal(0.5) },
      { price: new Decimal(Math.random() * 100000), percent: new Decimal(0.5) }
    ],
    notes: 'Some long notes here to simulate real data usage '.repeat(10)
  }));
};

const largeJournal = generateJournal(5000);

describe('Journal Serialization', () => {
  bench('JSON.stringify (blocking)', () => {
    JSON.stringify(largeJournal);
  });

  bench('stringifyAsync (non-blocking)', async () => {
    await serializationService.stringifyAsync(largeJournal);
  });
});
