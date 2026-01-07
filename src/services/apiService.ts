import { Decimal } from 'decimal.js';
import { getBitunixErrorKey } from '../utils/errorUtils';

// Define a type for the kline data object for clarity
export interface Kline {
    high: Decimal;
    low: Decimal;
    close: Decimal;
}

export interface Ticker24h {
    provider: 'bitunix' | 'binance';
    symbol: string;
    lastPrice: Decimal;
    priceChangePercent: Decimal;
    highPrice: Decimal;
    lowPrice: Decimal;
    volume: Decimal; // Base volume usually
    quoteVolume?: Decimal;
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
    // Helper to normalize symbols for API calls
    normalizeSymbol(symbol: string, provider: 'bitunix' | 'binance'): string {
        if (!symbol) return '';
        let s = symbol.toUpperCase();
        // Remove .P or P suffix if present for standardization logic, though APIs might need specific handling
        // Based on user input: "BTCUSDTP" or "BTCUSDT.P".
        // Based on curl tests: Bitunix wants "BTCUSDT", Binance Futures often wants "BTCUSDT" but checks might vary.
        // We will try to strip P suffixes to get the base pair, then let the API proxy handle it or pass as is if needed.
        // Actually, for Bitunix, we saw "BTCUSDT" works and "BTCUSDTP" fails.

        // Simple heuristic: If it ends in "P" or ".P" and isn't just "XRP" (unlikely), strip it.
        if (s.endsWith('.P')) {
            s = s.slice(0, -2);
        }

        // If the symbol seems to be just the coin (e.g. "BTC"), append USDT
        if (!s.includes('USDT') && !s.includes('USD')) {
            s += 'USDT';
        }

        // If it ends with P but is meant for Bitunix/Binance Futures that prefer standard symbols?
        // Let's rely on the user input mostly but fix the obvious "P" suffix issue if it fails,
        // OR just strip it if we know the provider doesn't like it.
        // Bitunix: BTCUSDT works. BTCUSDTP fails.
        // Robust fix: Only strip P if it is a suffix on top of standard pair (e.g. USDTP).
        if (s.endsWith('USDTP')) {
             s = s.slice(0, -1);
        }

        return s;
    },

    async fetchBitunixPrice(symbol: string): Promise<Decimal> {
        try {
            const normalized = apiService.normalizeSymbol(symbol, 'bitunix');
            const response = await fetch(`/api/tickers?provider=bitunix&symbols=${normalized}`);
            if (!response.ok) throw new Error('apiErrors.symbolNotFound');
            const res = await response.json();
            if (res.code !== undefined && res.code !== 0) {
                throw new Error(getBitunixErrorKey(res.code));
            }
            if (!res.data || res.data.length === 0) {
                throw new Error('apiErrors.invalidResponse');
            }
            const data = res.data[0];
            return new Decimal(data.lastPrice);
        } catch (e) {
            // Re-throw custom error messages or a generic one
            if (e instanceof Error && (e.message.startsWith('apiErrors.') || e.message.startsWith('bitunixErrors.'))) {
                throw e;
            }
            throw new Error('apiErrors.generic');
        }
    },

    async fetchBitunixKlines(symbol: string, interval: string, limit: number = 15): Promise<Kline[]> {
        try {
            const normalized = apiService.normalizeSymbol(symbol, 'bitunix');
            const response = await fetch(`/api/klines?provider=bitunix&symbol=${normalized}&interval=${interval}&limit=${limit}`);
            if (!response.ok) throw new Error('apiErrors.klineError');
            const res = await response.json();

            if (res.code !== undefined && res.code !== 0) {
                 throw new Error(getBitunixErrorKey(res.code));
            }

            if (!res.data) {
                throw new Error('apiErrors.invalidResponse');
            }

            // Map the response data to the required Kline interface
            return res.data.map((kline: { high: string, low: string, close: string }) => ({
                high: new Decimal(kline.high),
                low: new Decimal(kline.low),
                close: new Decimal(kline.close),
            }));
        } catch (e) {
            if (e instanceof Error && (e.message.startsWith('apiErrors.') || e.message.startsWith('bitunixErrors.'))) {
                throw e;
            }
            throw new Error('apiErrors.generic');
        }
    },

    async fetchBinancePrice(symbol: string): Promise<Decimal> {
        try {
            const normalized = apiService.normalizeSymbol(symbol, 'binance');
            const response = await fetch(`/api/tickers?provider=binance&symbols=${normalized}`);
            if (!response.ok) throw new Error('apiErrors.symbolNotFound');
            const data = await response.json();

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
            const normalized = apiService.normalizeSymbol(symbol, 'binance');
            const response = await fetch(`/api/klines?provider=binance&symbol=${normalized}&interval=${interval}&limit=${limit}`);
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
    },

    async fetchTicker24h(symbol: string, provider: 'bitunix' | 'binance'): Promise<Ticker24h> {
        try {
            const normalized = apiService.normalizeSymbol(symbol, provider);
            // We use the same tickers endpoint, but we need to ensure the backend proxy supports returning full data.
            // For Binance, we likely need to change the backend to use the 24hr endpoint instead of 'price' endpoint if provider is binance.
            // Or we can add a 'type=24hr' param to our proxy.
            const response = await fetch(`/api/tickers?provider=${provider}&symbols=${normalized}&type=24hr`);

            if (!response.ok) throw new Error('apiErrors.symbolNotFound');
            const data = await response.json();

            if (provider === 'bitunix') {
                if (data.code !== undefined && data.code !== 0) {
                    throw new Error(getBitunixErrorKey(data.code));
                }
                if (!data.data || data.data.length === 0) {
                    throw new Error('apiErrors.invalidResponse');
                }
                const ticker = data.data[0];
                // Bitunix fields: lastPrice, high, low, baseVol, quoteVol, but NO explicit "priceChangePercent" in the curl output I saw earlier.
                // Curl: {"symbol":"BTCUSDT","markPrice":"...","lastPrice":"...","open":"...","last":"...","quoteVol":"...","baseVol":"...","high":"...","low":"..."}
                // We can calculate change % from (last - open) / open * 100
                const open = new Decimal(ticker.open);
                const last = new Decimal(ticker.lastPrice);
                const change = last.minus(open).dividedBy(open).times(100);

                return {
                    provider,
                    symbol: normalized,
                    lastPrice: last,
                    highPrice: new Decimal(ticker.high),
                    lowPrice: new Decimal(ticker.low),
                    volume: new Decimal(ticker.baseVol),
                    quoteVolume: new Decimal(ticker.quoteVol),
                    priceChangePercent: change
                };
            } else {
                // Binance
                // We need to ensure the proxy calls the 24hr endpoint.
                // Response format for 24hr ticker:
                // { symbol, priceChange, priceChangePercent, weightedAvgPrice, prevClosePrice, lastPrice, lastQty, bidPrice, ... }
                if (!data || !data.lastPrice) {
                     throw new Error('apiErrors.invalidResponse');
                }
                return {
                    provider,
                    symbol: normalized,
                    lastPrice: new Decimal(data.lastPrice),
                    highPrice: new Decimal(data.highPrice),
                    lowPrice: new Decimal(data.lowPrice),
                    volume: new Decimal(data.volume), // volume is base asset volume
                    quoteVolume: new Decimal(data.quoteVolume),
                    priceChangePercent: new Decimal(data.priceChangePercent)
                };
            }

        } catch (e) {
            console.error("fetchTicker24h error", e);
             if (e instanceof Error && (e.message.startsWith('apiErrors.') || e.message.startsWith('bitunixErrors.'))) {
                throw e;
            }
            throw new Error('apiErrors.generic');
        }
    }
};
