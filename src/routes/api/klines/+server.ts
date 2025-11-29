import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, fetch }) => {
    const symbol = url.searchParams.get('symbol');
    const interval = url.searchParams.get('interval');
    const limit = url.searchParams.get('limit') || '15';
    const provider = url.searchParams.get('provider') || 'bitunix';

    if (!symbol || !interval) {
        return json({ message: 'Query parameters "symbol" and "interval" are required.' }, { status: 400 });
    }

    try {
        let apiUrl = '';
        if (provider === 'binance') {
            // Binance Futures API
            // https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=15m&limit=15
            apiUrl = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
        } else {
             // Bitunix
            apiUrl = `https://fapi.bitunix.com/api/v1/futures/market/kline?symbol=${symbol}&interval=${interval}&limit=${limit}`;
        }

        const response = await fetch(apiUrl);

        if (!response.ok) {
            const errorData = await response.text();
            return new Response(errorData, {
                status: response.status,
                statusText: response.statusText
            });
        }

        const data = await response.json();
        return json(data);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'An unknown error occurred.';
        return json({ message: `Internal server error: ${message}` }, { status: 500 });
    }
};
