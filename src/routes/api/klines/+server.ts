import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { cache } from '$lib/server/cache';

export const GET: RequestHandler = async ({ url, fetch }) => {
    const symbol = url.searchParams.get('symbol');
    const interval = url.searchParams.get('interval');
    const limit = url.searchParams.get('limit') || '15';
    const provider = url.searchParams.get('provider') || 'bitunix';

    if (!symbol || !interval) {
        return json({ message: 'Query parameters "symbol" and "interval" are required.' }, { status: 400 });
    }

    const cacheKey = `klines:${provider}:${symbol}:${interval}:${limit}`;

    try {
        const data = await cache.getOrFetch(cacheKey, async () => {
            let apiUrl = '';
            if (provider === 'binance') {
                // Binance Futures API
                apiUrl = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
            } else {
                 // Bitunix
                apiUrl = `https://fapi.bitunix.com/api/v1/futures/market/kline?symbol=${symbol}&interval=${interval}&limit=${limit}`;
            }

            const response = await fetch(apiUrl);

            if (!response.ok) {
                const errorText = await response.text();
                // eslint-disable-next-line no-throw-literal
                throw { status: response.status, message: errorText };
            }

            return await response.json();
        }, 1000); // 1 second TTL

        return json(data);

    } catch (error: any) {
         if (error && error.status && error.message) {
             return new Response(error.message, {
                status: error.status
            });
        }

        const message = error instanceof Error ? error.message : 'An unknown error occurred.';
        return json({ message: `Internal server error: ${message}` }, { status: 500 });
    }
};
