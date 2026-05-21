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
import {
    getCoinankTimeframe,
    getCoinankHeatmapSymbol,
    getCoinankUrl,
    getCoinglassUrl
} from './heatmapUtils';

describe('heatmapUtils', () => {
    describe('getCoinankTimeframe', () => {
        it('should map valid Cachy timeframes correctly', () => {
            expect(getCoinankTimeframe('5m')).toBe('12h');
            expect(getCoinankTimeframe('15m')).toBe('1d');
            expect(getCoinankTimeframe('1h')).toBe('3d');
            expect(getCoinankTimeframe('4h')).toBe('1w');
            expect(getCoinankTimeframe('1d')).toBe('1M');
        });

        it('should return default fallback for invalid timeframes', () => {
            expect(getCoinankTimeframe('3m')).toBe('3d');
            expect(getCoinankTimeframe('unknown')).toBe('3d');
            expect(getCoinankTimeframe('')).toBe('3d');
        });
    });

    describe('getCoinankHeatmapSymbol', () => {
        it('should normalize standard symbols to lowercase', () => {
            expect(getCoinankHeatmapSymbol('BTCUSDT')).toBe('btcusdt');
            expect(getCoinankHeatmapSymbol('ethusdt')).toBe('ethusdt');
        });

        it('should strip special characters', () => {
            expect(getCoinankHeatmapSymbol('BTC/USDT')).toBe('btcusdt');
            expect(getCoinankHeatmapSymbol('BTC-USDT')).toBe('btcusdt');
            expect(getCoinankHeatmapSymbol('ETHUSDT.P')).toBe('ethusdtp');
        });
    });

    describe('getCoinankUrl', () => {
        describe('iframe mode', () => {
            it('should format URL correctly for bitunix', () => {
                const url = getCoinankUrl('btcusdt', '1h', 'bitunix', 'iframe');
                expect(url).toBe('https://coinank.com/de/proChart?exchange=Bitunix&symbol=BTCUSDT&productType=SWAP&interval=1h');
            });

            it('should format URL correctly for bitget', () => {
                const url = getCoinankUrl('ethusdt', '4h', 'bitget', 'iframe');
                expect(url).toBe('https://coinank.com/de/proChart?exchange=Bitget&symbol=ETHUSDT&productType=SWAP&interval=4h');
            });
        });

        describe('link mode', () => {
            it('should format URL correctly with timeframe mapping', () => {
                const url = getCoinankUrl('BTC/USDT', '4h', 'bitunix', 'link');
                // Symbol normalized to lowercase & stripped: btcusdt
                // TF '4h' mapped to '1w'
                expect(url).toBe('https://coinank.com/de/chart/derivatives/liq-heat-map/btcusdt/1w');
            });

            it('should use default timeframe for unknown tf', () => {
                const url = getCoinankUrl('DOGEUSDT', 'unknown', 'bitget', 'link');
                expect(url).toBe('https://coinank.com/de/chart/derivatives/liq-heat-map/dogeusdt/3d');
            });
        });
    });

    describe('getCoinglassUrl', () => {
        it('should format URL correctly for standard symbols', () => {
            expect(getCoinglassUrl('BTCUSDT')).toBe('https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=BTC');
            expect(getCoinglassUrl('ethusdt')).toBe('https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=ETH');
        });

        it('should strip perpetual suffixes', () => {
            expect(getCoinglassUrl('DOGEUSDT.P')).toBe('https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=DOGE');
            expect(getCoinglassUrl('SOLUSDTP')).toBe('https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=SOL');
        });

        it('should handle symbols without USDT', () => {
            expect(getCoinglassUrl('BTCUSD')).toBe('https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=BTCUSD');
        });
    });
});
