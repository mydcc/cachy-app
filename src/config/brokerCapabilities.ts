export const BROKER_CAPABILITIES: Record<string, { nativeTimeframes: string[] }> = {
    // Bitunix Native Timeframes (from API docs or experimentation)
    bitunix: {
        nativeTimeframes: ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w", "1M"]
    },
    // Future placeholders
    bitget: {
        nativeTimeframes: ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w", "1M"]
    },
    binance: {
        nativeTimeframes: ["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h", "1d", "3d", "1w", "1M"]
    }
};
