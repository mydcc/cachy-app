import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { cache } from '$lib/server/cache';

export const GET: RequestHandler = async ({ url, fetch }) => {
    const symbols = url.searchParams.get('symbols');
    const provider = url.searchParams.get('provider') || 'bitunix';
    const type = url.searchParams.get('type'); // 'price' (default) or '24hr'

    if (!symbols) {
        return json({ message: 'Query parameter "symbols" is required.' }, { status: 400 });
    }

    const cacheKey = `tickers:${provider}:${symbols}:${type || 'default'}`;

    try {
        const data = await cache.getOrFetch(cacheKey, async () => {
            let apiUrl = '';
            if (provider === 'binance') {
                // Binance Futures API
                if (type === '24hr') {
                    apiUrl = `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbols}`;
                } else {
                    apiUrl = `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbols}`;
                }
            } else {
                // Default to Bitunix
                apiUrl = `https://fapi.bitunix.com/api/v1/futures/market/tickers?symbols=${symbols}`;
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
