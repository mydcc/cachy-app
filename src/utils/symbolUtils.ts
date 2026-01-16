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
    // Heuristic: If length <= 5 and not containing USDT/USDC, append USDT.
    // Explicitly avoid double suffix if symbol is like "USDC" -> "USDCUSDT" (valid pair)
    // But prevent "BTCUSDC" -> "BTCUSDCUSDT" (invalid)
    // Actually, "BTCUSDC" is length 7. "USDC" is 4. "SOL" is 3.
    // If someone passes "BTC", length 3 -> "BTCUSDT".
    // If someone passes "USDC", length 4 -> "USDCUSDT" (This is a valid pair on some exchanges, e.g. USDC/USDT)
    // If someone passes "ETHBTC", length 6 -> Ignored by this check.
    if (!s.includes("USDT") && !s.includes("USDC") && s.length <= 5) {
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
