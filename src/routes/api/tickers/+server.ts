import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, fetch }) => {
    const symbols = url.searchParams.get('symbols');
    const provider = url.searchParams.get('provider') || 'bitunix';
    const type = url.searchParams.get('type'); // 'price' (default) or '24hr'

    if (!symbols) {
        return json({ message: 'Query parameter "symbols" is required.' }, { status: 400 });
    }

    try {
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
            // Bitunix tickers endpoint already returns full data, so type param doesn't change URL much
            // but we keep it consistent.
            apiUrl = `https://fapi.bitunix.com/api/v1/futures/market/tickers?symbols=${symbols}`;
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
