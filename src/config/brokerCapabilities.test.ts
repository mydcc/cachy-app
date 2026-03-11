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

import { describe, it, expect } from 'vitest';
import { BROKER_CAPABILITIES } from './brokerCapabilities';

describe('BROKER_CAPABILITIES', () => {
    it('should have valid configuration for all defined brokers', () => {
        const brokers = Object.keys(BROKER_CAPABILITIES);
        expect(brokers.length).toBeGreaterThan(0);

        for (const broker of brokers) {
            const capabilities = BROKER_CAPABILITIES[broker];
            expect(capabilities).toBeDefined();
            expect(capabilities.nativeTimeframes).toBeInstanceOf(Array);
            expect(capabilities.nativeTimeframes.length).toBeGreaterThan(0);

            // Ensure every timeframe is a string
            capabilities.nativeTimeframes.forEach(tf => {
                expect(typeof tf).toBe('string');
            });
        }
    });

    it('should have correct nativeTimeframes for bitunix', () => {
        expect(BROKER_CAPABILITIES.bitunix).toBeDefined();
        expect(BROKER_CAPABILITIES.bitunix.nativeTimeframes).toEqual([
            "1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w", "1M"
        ]);
    });
});
