/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * Maps Cachy timeframes (chart intervals) to Coinank Liquidation Heatmap timeframes (lookback periods).
 *
 * Mapping Rules:
 * 5m  -> 12h
 * 15m -> 1d
 * 1h  -> 3d
 * 4h  -> 1w
 * 1d  -> 1M
 */
export function getCoinankTimeframe(cachyTf: string): string {
    switch (cachyTf) {
        case '5m': return '12h';
        case '15m': return '1d';
        case '1h': return '3d';
        case '4h': return '1w';
        case '1d': return '1M';
        default: return '3d'; // Default fallback
    }
}

/**
 * Normalizes symbol for Coinank Heatmap (usually lowercase, e.g., 'btcusdt').
 */
export function getCoinankHeatmapSymbol(symbol: string): string {
    return symbol.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Generates the Coinank URL based on mode.
 *
 * @param symbol Full symbol (e.g. BTCUSDT)
 * @param tf Cachy Timeframe (e.g. 1h)
 * @param provider 'bitunix' | 'bitget'
 * @param mode 'link' (Heatmap) | 'iframe' (ProChart)
 */
export function getCoinankUrl(symbol: string, tf: string, provider: 'bitunix' | 'bitget', mode: 'link' | 'iframe'): string {
    if (mode === 'iframe') {
        // ProChart URL
        // Example: https://coinank.com/de/proChart?exchange=Bitunix&symbol=BTCUSDT&productType=SWAP&interval=1h
        // Uses Standard Timeframe (tf) and Uppercase Symbol
        const exchange = provider === 'bitget' ? 'Bitget' : 'Bitunix';
        const formattedSymbol = symbol.toUpperCase();
        return `https://coinank.com/de/proChart?exchange=${exchange}&symbol=${formattedSymbol}&productType=SWAP&interval=${tf}`;
    } else {
        // Heatmap Direct Link
        // Example: https://coinank.com/de/chart/derivatives/liq-heat-map/btcusdt/1w
        // Uses Mapped Timeframe and Lowercase Symbol
        const coinankSymbol = getCoinankHeatmapSymbol(symbol);
        const coinankTf = getCoinankTimeframe(tf);
        return `https://coinank.com/de/chart/derivatives/liq-heat-map/${coinankSymbol}/${coinankTf}`;
    }
}

/**
 * Generates Coinglass Heatmap URL.
 * Example: https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=BTC
 */
export function getCoinglassUrl(symbol: string): string {
    const baseAsset = symbol.toUpperCase().replace(/USDT(\.P|P)?$/, "");
    return `https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=${baseAsset}`;
}
