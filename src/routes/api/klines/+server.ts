import { json } from '@sveltejs/kit';

export async function GET({ url }) {
    const symbol = url.searchParams.get('symbol');
    const interval = url.searchParams.get('interval') || '1d';
    const limit = url.searchParams.get('limit') || '50';

    if (!symbol) {
        return json({ error: 'Symbol is required' }, { status: 400 });
    }

    // Symbol is already normalized by the frontend service, but let's ensure no legacy suffixes remain.
    // Only strip .P suffix explicitly if it exists at the end.
    // We do NOT strip 'P' globally to avoid breaking symbols like XRPUSDT or PEPEUSDT.
    let apiSymbol = symbol;
    if (apiSymbol.endsWith('.P')) {
        apiSymbol = apiSymbol.slice(0, -2);
    }
    // Also handle trailing 'P' if it's not part of the base symbol name (complex heuristic, but mostly safer to trust frontend)
    // Legacy support: if symbol is strictly 'USDTP' suffix?
    // The frontend logic `normalizeSymbol` is robust. We should trust it mostly.

    // Safety check for legacy double-P removal if normalized was incomplete
    // But importantly, do NOT replace 'P' inside the string (like XRP).

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
