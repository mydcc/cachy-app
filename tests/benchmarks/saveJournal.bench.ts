/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

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
