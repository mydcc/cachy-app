import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Decimal } from 'decimal.js';

export const GET: RequestHandler = async ({ url }) => {
    const symbol = url.searchParams.get('symbol');
    const interval = url.searchParams.get('interval') || '1d';
    const limitParam = url.searchParams.get('limit');
    const provider = url.searchParams.get('provider') || 'bitunix';
    const limit = limitParam ? parseInt(limitParam) : 50;

    if (!symbol) {
        return json({ error: 'Symbol is required' }, { status: 400 });
    }

    try {
        let klines;
        if (provider === 'binance') {
            klines = await fetchBinanceKlines(symbol, interval, limit);
        } else {
            klines = await fetchBitunixKlines(symbol, interval, limit);
        }
        return json(klines);
    } catch (e: any) {
        console.error(`Error fetching klines from ${provider}:`, e);
        return json({ error: e.message || 'Failed to fetch klines' }, { status: 500 });
    }
};

async function fetchBitunixKlines(symbol: string, interval: string, limit: number) {
    const baseUrl = 'https://fapi.bitunix.com';
    const path = '/api/v1/futures/market/kline';

    // Map internal interval to Bitunix interval if needed
    // Bitunix: 1min, 5min, 15min, 30min, 60min, 4h, 1day, 1week, 1month
    // App: 1m, 5m, 15m, 1h, 4h, 1d
    const map: Record<string, string> = {
        '1m': '1min',
        '5m': '5min',
        '15m': '15min',
        '30m': '30min',
        '1h': '60min',
        '4h': '4h',
        '1d': '1day',
        '1w': '1week',
        '1M': '1month'
    };
    const mappedInterval = map[interval] || interval;

    const queryString = new URLSearchParams({
        symbol: symbol.toUpperCase(),
        interval: mappedInterval,
        limit: limit.toString()
    }).toString();

    const response = await fetch(`${baseUrl}${path}?${queryString}`);

    if (!response.ok) {
        throw new Error(`Bitunix API error: ${response.status}`);
    }

    const data = await response.json();
    if (data.code !== 0 && data.code !== '0') {
         throw new Error(`Bitunix API error: ${data.msg}`);
    }

    // Bitunix Data Format:
    // { "data": [ { "o": "...", "c": "...", "h": "...", "l": "...", "v": "...", "ts": ... }, ... ] }
    // OR sometimes array of arrays? Doc says:
    // Response: [{"id":1606963500,"open":19216.5,"close":19221.5,"low":19203.5,"high":19233.0,"vol":301.782}, ...]
    // But let's check what I implemented before or check docs.
    // Doc says: Get Kline -> Response data list of objects?
    // Let's assume the previous implementation was correct or robust.

    // Previous implementation assumed data.data is the array.
    const results = data.data || [];

    return results.map((k: any) => ({
        // Bitunix usually returns object keys or array.
        // Based on typical Bitunix API, it's objects: open, close, high, low, vol
        // But let's handle potential "o", "c" etc.
        open: new Decimal(k.open || k.o || 0),
        high: new Decimal(k.high || k.h || 0),
        low: new Decimal(k.low || k.l || 0),
        close: new Decimal(k.close || k.c || 0),
        volume: new Decimal(k.vol || k.v || 0),
        timestamp: k.id || k.ts || k.time || 0
    })).sort((a: any, b: any) => a.timestamp - b.timestamp); // Ensure ascending
}

async function fetchBinanceKlines(symbol: string, interval: string, limit: number) {
    const baseUrl = 'https://fapi.binance.com';
    const path = '/fapi/v1/klines';

    // Binance: 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 8h, 12h, 1d, 3d, 1w, 1M
    // App: 1m, 5m, 15m, 1h, 4h, 1d matches exactly mostly.

    const queryString = new URLSearchParams({
        symbol: symbol.toUpperCase(),
        interval: interval,
        limit: limit.toString()
    }).toString();

    const response = await fetch(`${baseUrl}${path}?${queryString}`);

    if (!response.ok) {
         throw new Error(`Binance API error: ${response.status}`);
    }

    const data = await response.json();
    // Binance Data Format: Array of Arrays
    // [ [ Open Time, Open, High, Low, Close, Volume, Close Time, ... ], ... ]

    return data.map((k: any[]) => ({
        timestamp: k[0],
        open: new Decimal(k[1]),
        high: new Decimal(k[2]),
        low: new Decimal(k[3]),
        close: new Decimal(k[4]),
        volume: new Decimal(k[5])
    })).sort((a: any, b: any) => a.timestamp - b.timestamp);
}
