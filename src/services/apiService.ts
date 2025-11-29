import { Decimal } from 'decimal.js';

// Define a type for the kline data object for clarity
export interface Kline {
    high: Decimal;
    low: Decimal;
    close: Decimal;
}

// Define the structure of a Binance Kline entry
// [Open time, Open, High, Low, Close, Volume, Close time, Quote asset volume, Number of trades, Taker buy base asset volume, Taker buy quote asset volume, Ignore]
type BinanceKline = [
    number, // Open time
    string, // Open
    string, // High
    string, // Low
    string, // Close
    string, // Volume
    number, // Close time
    string, // Quote asset volume
    number, // Number of trades
    string, // Taker buy base asset volume
    string, // Taker buy quote asset volume
    string  // Ignore
];

export const apiService = {
    async fetchBitunixPrice(symbol: string): Promise<Decimal> {
        try {
            const response = await fetch(`/api/tickers?provider=bitunix&symbols=${symbol}`);
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
            const response = await fetch(`/api/klines?provider=bitunix&symbol=${symbol}&interval=${interval}&limit=${limit}`);
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
            const response = await fetch(`/api/tickers?provider=binance&symbols=${symbol}`);
            if (!response.ok) throw new Error('apiErrors.symbolNotFound');
            const data = await response.json();

            // Binance returns an object with 'price' or an array if multiple symbols,
            // but our proxy handles one symbol for price check mostly.
            // Adjust based on actual proxy response.
            // Assuming proxy returns Binance standard: { symbol: "BTCUSDT", price: "..." }
            if (!data || !data.price) {
                 throw new Error('apiErrors.invalidResponse');
            }
            return new Decimal(data.price);
        } catch (e) {
             if (e instanceof Error && (e.message === 'apiErrors.symbolNotFound' || e.message === 'apiErrors.invalidResponse')) {
                throw e;
            }
            throw new Error('apiErrors.generic');
        }
    },

    async fetchBinanceKlines(symbol: string, interval: string, limit: number = 15): Promise<Kline[]> {
        try {
            const response = await fetch(`/api/klines?provider=binance&symbol=${symbol}&interval=${interval}&limit=${limit}`);
            if (!response.ok) throw new Error('apiErrors.klineError');
            const data = await response.json();

            if (!Array.isArray(data)) {
                throw new Error('apiErrors.invalidResponse');
            }

            // Binance kline format: [ [time, open, high, low, close, volume, ...], ... ]
            return data.map((kline: BinanceKline) => ({
                high: new Decimal(kline[2]),
                low: new Decimal(kline[3]),
                close: new Decimal(kline[4]),
            }));
        } catch (e) {
            if (e instanceof Error && (e.message === 'apiErrors.klineError' || e.message === 'apiErrors.invalidResponse')) {
                throw e;
            }
            throw new Error('apiErrors.generic');
        }
    }
};
