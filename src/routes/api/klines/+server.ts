import { json } from '@sveltejs/kit';

export async function GET({ url }) {
    const symbol = url.searchParams.get('symbol');
    const interval = url.searchParams.get('interval') || '1d';
    const limit = url.searchParams.get('limit') || '50';

    if (!symbol) {
        return json({ error: 'Symbol is required' }, { status: 400 });
    }

    // Normalize symbol if needed. The frontend (apiService) usually sends a normalized symbol (e.g., BTCUSDT).
    // Previously there was logic here to replace 'P' which broke symbols like XRP.
    // We now trust the symbol or just rely on Bitunix expecting standard pair names.
    // If the symbol comes in as 'BTCUSDTP', we might want to ensure it is 'BTCUSDT',
    // but apiService handles this. We will use the symbol as is.
    const apiSymbol = symbol;

    try {
        const apiUrl = `https://fapi.bitunix.com/api/v1/futures/market/kline?symbol=${apiSymbol}&interval=${interval}&limit=${limit}`;

        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`Bitunix API error: ${response.statusText}`);
        }

        const data = await response.json();
        return json(data);
    } catch (error) {
        console.error('Error fetching kline data:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return json({ error: message }, { status: 500 });
    }
}
