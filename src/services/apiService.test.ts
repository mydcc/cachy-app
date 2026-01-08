import { describe, it, expect } from 'vitest';
import { apiService } from './apiService';

describe('apiService - normalizeSymbol', () => {
    it('should normalize basic coin symbols to USDT pair', () => {
        expect(apiService.normalizeSymbol('BTC', 'bitunix')).toBe('BTCUSDT');
        expect(apiService.normalizeSymbol('ETH', 'bitunix')).toBe('ETHUSDT');
    });

    it('should keep existing USDT symbols', () => {
        expect(apiService.normalizeSymbol('BTCUSDT', 'bitunix')).toBe('BTCUSDT');
    });

    it('should strip .P suffix', () => {
        expect(apiService.normalizeSymbol('BTCUSDT.P', 'bitunix')).toBe('BTCUSDT');
    });

    it('should strip P from USDTP symbols', () => {
        expect(apiService.normalizeSymbol('BTCUSDTP', 'bitunix')).toBe('BTCUSDT');
    });

    it('should handle symbols containing USD but not ending in P', () => {
        expect(apiService.normalizeSymbol('BTCUSD', 'bitunix')).toBe('BTCUSD'); // No append USDT
    });

    it('should not strip P from other pairs unless specified', () => {
        // If logic is specific to USDTP
        expect(apiService.normalizeSymbol('BTCUSDP', 'bitunix')).toBe('BTCUSDP');
    });

    it('should handle lowercase input', () => {
        expect(apiService.normalizeSymbol('btcusdtp', 'bitunix')).toBe('BTCUSDT');
    });
});
