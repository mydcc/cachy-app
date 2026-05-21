/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { describe, it, expect } from 'vitest';
import {
    getCoinankTimeframe,
    getCoinankHeatmapSymbol,
    getCoinankUrl,
    getCoinglassUrl
} from './heatmapUtils';

describe('heatmapUtils', () => {
    describe('getCoinglassUrl', () => {
        it('should correctly format standard USDT symbols', () => {
            expect(getCoinglassUrl('BTCUSDT')).toBe('https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=BTC');
            expect(getCoinglassUrl('ETHUSDT')).toBe('https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=ETH');
        });

        it('should correctly format symbols with USDT.P suffix', () => {
            expect(getCoinglassUrl('SOLUSDT.P')).toBe('https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=SOL');
        });

        it('should correctly format symbols with USDTP suffix', () => {
            expect(getCoinglassUrl('ADAUSDTP')).toBe('https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=ADA');
        });

        it('should handle lowercase symbols', () => {
            expect(getCoinglassUrl('btcusdt')).toBe('https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=BTC');
            expect(getCoinglassUrl('ethusdt.p')).toBe('https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=ETH');
        });

        it('should handle symbols without the standard suffix', () => {
            expect(getCoinglassUrl('DOGE')).toBe('https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=DOGE');
        });
    });

    describe('getCoinankTimeframe', () => {
        it('should map cachy timeframes correctly', () => {
            expect(getCoinankTimeframe('5m')).toBe('12h');
            expect(getCoinankTimeframe('15m')).toBe('1d');
            expect(getCoinankTimeframe('1h')).toBe('3d');
            expect(getCoinankTimeframe('4h')).toBe('1w');
            expect(getCoinankTimeframe('1d')).toBe('1M');
        });

        it('should return default fallback for unknown timeframes', () => {
            expect(getCoinankTimeframe('1m')).toBe('3d');
            expect(getCoinankTimeframe('1w')).toBe('3d');
            expect(getCoinankTimeframe('foo')).toBe('3d');
        });
    });

    describe('getCoinankHeatmapSymbol', () => {
        it('should convert to lowercase and remove non-alphanumeric characters', () => {
            expect(getCoinankHeatmapSymbol('BTCUSDT')).toBe('btcusdt');
            expect(getCoinankHeatmapSymbol('ETH-USDT')).toBe('ethusdt');
            expect(getCoinankHeatmapSymbol('Sol_USDT')).toBe('solusdt');
            expect(getCoinankHeatmapSymbol('ADAUSDT.P')).toBe('adausdtp');
        });
    });

    describe('getCoinankUrl', () => {
        it('should format iframe ProChart url correctly', () => {
            expect(getCoinankUrl('BTCUSDT', '1h', 'bitunix', 'iframe'))
                .toBe('https://coinank.com/de/proChart?exchange=Bitunix&symbol=BTCUSDT&productType=SWAP&interval=1h');
            expect(getCoinankUrl('ethusdt', '4h', 'bitget', 'iframe'))
                .toBe('https://coinank.com/de/proChart?exchange=Bitget&symbol=ETHUSDT&productType=SWAP&interval=4h');
        });

        it('should format direct heatmap link url correctly', () => {
            // mode = link -> uses getCoinankHeatmapSymbol and getCoinankTimeframe
            // BTCUSDT -> btcusdt, 1h -> 3d
            expect(getCoinankUrl('BTCUSDT', '1h', 'bitunix', 'link'))
                .toBe('https://coinank.com/de/chart/derivatives/liq-heat-map/btcusdt/3d');

            // SOL-USDT -> solusdt, 5m -> 12h
            expect(getCoinankUrl('SOL-USDT', '5m', 'bitget', 'link'))
                .toBe('https://coinank.com/de/chart/derivatives/liq-heat-map/solusdt/12h');
        });
    });
});
