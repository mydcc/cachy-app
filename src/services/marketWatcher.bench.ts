/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
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
import { marketWatcher } from './marketWatcher';
import { Decimal } from 'decimal.js';

describe('marketWatcher fillGaps', () => {
    // Generate data - Deterministic
    const intervalMs = 60000;
    const start = 1700000000000;
    const count = 10000;
    const klines: any[] = [];
    let currentTime = start;

    for (let i = 0; i < count; i++) {
        klines.push({
            time: currentTime,
            open: new Decimal(50000),
            high: new Decimal(50100),
            low: new Decimal(49900),
            close: new Decimal(50050),
            volume: new Decimal(1.5)
        });

        // Fixed pattern: Every 20 candles, introduce a gap of 5 candles
        if (i % 20 === 19) {
            // Gap of 5 minutes
            currentTime += (5 + 1) * intervalMs;
        } else {
            currentTime += intervalMs;
        }
    }

    bench('fillGaps with fixed gaps', () => {
        (marketWatcher as any).fillGaps(klines, intervalMs);
    });
});
