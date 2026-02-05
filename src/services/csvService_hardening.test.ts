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

        // Internal ID should be a safe number (generated timestamp+random)
        expect(typeof trade.id).toBe('number');
        expect(Number.isSafeInteger(trade.id)).toBe(true);
        expect(trade.id).not.toBe(parseFloat(largeId)); // Should NOT match the unsafe float parse

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
