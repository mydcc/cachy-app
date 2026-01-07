import { json } from '@sveltejs/kit';

export async function GET({ url }) {
    const symbol = url.searchParams.get('symbol');
    const interval = url.searchParams.get('interval') || '1d';
    const limit = url.searchParams.get('limit') || '50';

    if (!symbol) {
        return json({ error: 'Symbol is required' }, { status: 400 });
    }

    // Normalize symbol if needed (remove P, .P suffix if Bitunix expects standard)
    // Bitunix usually expects e.g. BTCUSDT
    let apiSymbol = symbol.replace('.P', '').replace('P', '');
    if (!apiSymbol.endsWith('USDT')) {
         // Handle cases if any
    }

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
        return json({ error: error.message }, { status: 500 });
    }
}
