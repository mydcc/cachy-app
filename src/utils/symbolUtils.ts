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

    let s = symbol.trim().toUpperCase().replace(".P", "").replace(":USDT", "").replace("-P", "");

    // If it's just "BTC", make it "BTCUSDT"
    if (!s.includes("USDT") && s.length <= 5) {
        s = s + "USDT";
    }

    // If it's "BTC-USDT", make it "BTCUSDT"
    s = s.replace("-USDT", "USDT");
    if (s.endsWith("USDTP")) {
        s = s.substring(0, s.length - 1);
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
