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

import { describe, it, expect, vi } from 'vitest';
import { csvService } from './csvService';

// Mock Svelte Store and i18n
vi.mock('../stores/settings.svelte', () => ({
  settingsState: {
    useUtcDateParsing: false
  }
}));

vi.mock('../locales/i18n', () => ({
  _: {
    subscribe: () => {}
  },
  get: () => (key: string) => key
}));

describe('CSV Service Hardening', () => {
    it('should handle large IDs correctly by generating a safe internal ID and preserving the large ID in tradeId', () => {
        const largeId = "1234567890123456789"; // 19 digits
        const csvContent = `ID,Datum,Uhrzeit,Symbol,Typ,Status,Einstieg,Stop Loss
${largeId},2023-01-01,12:00,BTCUSDT,Long,CLOSED,50000,49000`;

        const result = csvService.parseCSVContent(csvContent);
        const trade = result[0];

        // Internal ID should be preserved as string (UUID or original large ID) to prevent precision loss
        expect(typeof trade.id).toBe('string');
        expect(trade.id).toBe(largeId); // Should exactly match the original large ID as string

        // External ID should be preserved exactly as string
        expect(trade.tradeId).toBe(largeId);
    });

    it('should handle standard safe IDs correctly', () => {
        const safeId = "12345";
        const csvContent = `ID,Datum,Uhrzeit,Symbol,Typ,Status,Einstieg,Stop Loss
${safeId},2023-01-01,12:00,BTCUSDT,Long,CLOSED,50000,49000`;

        const result = csvService.parseCSVContent(csvContent);
        const trade = result[0];

        // Internal ID should match input
        expect(trade.id).toBe(12345);
        expect(trade.tradeId).toBe("12345");
    });
});
