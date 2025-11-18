import { Decimal } from 'decimal.js';
import { get } from 'svelte/store';
import { settingsStore } from '../stores/settingsStore';

// Define a type for the kline data object for clarity
export interface Kline {
    high: Decimal;
    low: Decimal;
    close: Decimal;
}

export const apiService = {
    async fetchPrice(symbol: string): Promise<Decimal> {
        const { apiProvider } = get(settingsStore);
        if (apiProvider === 'Binance') {
            return this.fetchBinancePrice(symbol);
        }
        return this.fetchBitunixPrice(symbol);
    },

    async fetchKlines(symbol: string, interval: string, limit: number = 15): Promise<Kline[]> {
        const { apiProvider } = get(settingsStore);
        if (apiProvider === 'Binance') {
            return this.fetchBinanceKlines(symbol, interval, limit);
        }
        return this.fetchBitunixKlines(symbol, interval, limit);
    },

    async fetchBitunixPrice(symbol: string): Promise<Decimal> {
        try {
            const response = await fetch(`/api/tickers?symbols=${symbol}`);
            if (!response.ok) throw new Error('apiErrors.symbolNotFound');
            const res = await response.json();
            if (res.code !== 0 || !res.data || res.data.length === 0) {
                throw new Error('apiErrors.invalidResponse');
            }
            const data = res.data[0];
            return new Decimal(data.lastPrice);
        } catch (e) {
            // Re-throw custom error messages or a generic one
            if (e instanceof Error && (e.message === 'apiErrors.symbolNotFound' || e.message === 'apiErrors.invalidResponse')) {
                throw e;
            }
            throw new Error('apiErrors.generic');
        }
    },

    async fetchBitunixKlines(symbol: string, interval: string, limit: number = 15): Promise<Kline[]> {
        try {
            const response = await fetch(`/api/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
            if (!response.ok) throw new Error('apiErrors.klineError');
            const res = await response.json();
            if (res.code !== 0 || !res.data) {
                throw new Error('apiErrors.invalidResponse');
            }

            // Map the response data to the required Kline interface
            return res.data.map((kline: { high: string, low: string, close: string }) => ({
                high: new Decimal(kline.high),
                low: new Decimal(kline.low),
                close: new Decimal(kline.close),
            }));
        } catch (e) {
            if (e instanceof Error && (e.message === 'apiErrors.klineError' || e.message === 'apiErrors.invalidResponse')) {
                throw e;
            }
            throw new Error('apiErrors.generic');
        }
    },

    async fetchBinancePrice(symbol: string): Promise<Decimal> {
        try {
            // Binance uses symbols like BTCUSDT, without the slash
            const formattedSymbol = symbol.replace('/', '');
            const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${formattedSymbol}`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.msg || 'apiErrors.symbolNotFound');
            }
            const data = await response.json();
            if (!data.price) {
                throw new Error('apiErrors.invalidResponse');
            }
            return new Decimal(data.price);
        } catch (e) {
            if (e instanceof Error) {
                throw e;
            }
            throw new Error('apiErrors.generic');
        }
    },

    async fetchBinanceKlines(symbol: string, interval: string, limit: number = 15): Promise<Kline[]> {
        try {
            const formattedSymbol = symbol.replace('/', '');
            const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${formattedSymbol}&interval=${interval}&limit=${limit}`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.msg || 'apiErrors.klineError');
            }
            const data = await response.json();
            if (!Array.isArray(data)) {
                throw new Error('apiErrors.invalidResponse');
            }

            return data.map((kline: any[]) => ({
                high: new Decimal(kline[2]),
                low: new Decimal(kline[3]),
                close: new Decimal(kline[4]),
            }));
        } catch (e) {
            if (e instanceof Error) {
                throw e;
            }
            throw new Error('apiErrors.generic');
        }
    }
};