/**
 * Utility for standardizing symbol normalization across different providers and services.
 */

/**
 * Normalizes a trading symbol for a specific provider.
 * @param symbol The raw symbol (e.g., "BTC", "BTCUSDT", "btcusdt")
 * @param provider The API provider ("bitunix" or "binance")
 * @returns The normalized symbol string in uppercase and provider-specific format.
 */
export function normalizeSymbol(symbol: string, provider: "bitunix" | "binance" | string): string {
    if (!symbol) return "";

    let s = symbol.trim().toUpperCase();

    // Remove "P" suffix often used for Perpetual/Futures in some UIs if it's followed by USDT or alone
    // But be careful: some coins might end with P. 
    // For Bitunix/Binance, we usually want SYMBOLUSDT.

    if (s.endsWith("P") && s.length > 3 && !s.includes("USDT")) {
        s = s.slice(0, -1);
    }

    // Ensure USDT suffix for standardized lookups if missing
    if (!s.includes("USDT") && s !== "USDT") {
        s = s + "USDT";
    }

    return s;
}

/**
 * Strips provider-specific suffixes for display purposes.
 */
export function formatSymbolForDisplay(symbol: string): string {
    if (!symbol) return "";
    return symbol.replace("USDT", "").replace("P", "");
}
