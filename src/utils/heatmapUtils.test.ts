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
    describe('getCoinankHeatmapSymbol', () => {
        it('should convert symbols to lowercase and remove non-alphanumeric characters', () => {
            expect(getCoinankHeatmapSymbol('BTCUSDT')).toBe('btcusdt');
            expect(getCoinankHeatmapSymbol('ETH-USDT')).toBe('ethusdt');
            expect(getCoinankHeatmapSymbol('SOL_USDT')).toBe('solusdt');
            expect(getCoinankHeatmapSymbol('1000PEPE.USDT')).toBe('1000pepeusdt');
            expect(getCoinankHeatmapSymbol('BTC/USDT')).toBe('btcusdt');
            expect(getCoinankHeatmapSymbol(' btc usdt ')).toBe('btcusdt');
        });

        it('should return empty string for empty input', () => {
             expect(getCoinankHeatmapSymbol('')).toBe('');
        });
    });

    describe('getCoinankTimeframe', () => {
        it('should correctly map Cachy timeframes to Coinank timeframes', () => {
            expect(getCoinankTimeframe('5m')).toBe('12h');
            expect(getCoinankTimeframe('15m')).toBe('1d');
            expect(getCoinankTimeframe('1h')).toBe('3d');
            expect(getCoinankTimeframe('4h')).toBe('1w');
            expect(getCoinankTimeframe('1d')).toBe('1M');
        });

        it('should use default fallback 3d for unmapped timeframes', () => {
            expect(getCoinankTimeframe('1m')).toBe('3d');
            expect(getCoinankTimeframe('30m')).toBe('3d');
            expect(getCoinankTimeframe('1w')).toBe('3d');
            expect(getCoinankTimeframe('invalid')).toBe('3d');
        });
    });

    describe('getCoinankUrl', () => {
        it('should generate ProChart URL for iframe mode with Bitget', () => {
            const url = getCoinankUrl('BTC-USDT', '1h', 'bitget', 'iframe');
            expect(url).toBe('https://coinank.com/de/proChart?exchange=Bitget&symbol=BTC-USDT&productType=SWAP&interval=1h');
        });

        it('should generate ProChart URL for iframe mode with Bitunix', () => {
            const url = getCoinankUrl('ethusdt', '4h', 'bitunix', 'iframe');
            expect(url).toBe('https://coinank.com/de/proChart?exchange=Bitunix&symbol=ETHUSDT&productType=SWAP&interval=4h');
        });

        it('should generate Heatmap Direct Link URL for link mode', () => {
            const url = getCoinankUrl('BTC-USDT', '1h', 'bitunix', 'link');
            // 'BTC-USDT' -> 'btcusdt'
            // '1h' -> '3d'
            expect(url).toBe('https://coinank.com/de/chart/derivatives/liq-heat-map/btcusdt/3d');
        });

        it('should generate Heatmap Direct Link URL for link mode handling edge cases', () => {
             const url = getCoinankUrl('1000PEPE_USDT.P', '5m', 'bitget', 'link');
             // '1000PEPE_USDT.P' -> '1000pepeusdtp'
             // '5m' -> '12h'
             expect(url).toBe('https://coinank.com/de/chart/derivatives/liq-heat-map/1000pepeusdtp/12h');
        });
    });

    describe('getCoinglassUrl', () => {
        it('should extract base asset and build URL correctly', () => {
            expect(getCoinglassUrl('BTCUSDT')).toBe('https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=BTC');
            expect(getCoinglassUrl('ethusdt')).toBe('https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=ETH');
        });

        it('should correctly strip .P suffix', () => {
            expect(getCoinglassUrl('DOGEUSDT.P')).toBe('https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=DOGE');
        });

        it('should correctly strip P suffix', () => {
             expect(getCoinglassUrl('SOLUSDTP')).toBe('https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=SOL');
        });

        it('should handle symbols without USDT', () => {
             expect(getCoinglassUrl('BTCUSD')).toBe('https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=BTCUSD');
        });
    });
});
