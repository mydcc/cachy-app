/*
 * Copyright (C) 2026 MYDCT
 */

/**
 * Safely converts a timeframe string (e.g., "1m", "4h", "1d") to milliseconds.
 * Returns default if invalid to prevent crashes.
 *
 * @param tf Timeframe string
 * @param defaultMs Default milliseconds if parsing fails (default: 60000 / 1m)
 */
export function safeTfToMs(tf: string, defaultMs = 60000): number {
    if (!tf || typeof tf !== 'string') return defaultMs;

    // Strict regex: integer followed by unit (m, h, d, w, M)
    const match = tf.match(/^(\d+)([mhdwM])$/);
    if (!match) return defaultMs;

    const value = parseInt(match[1], 10);
    const unit = match[2];

    if (isNaN(value) || value <= 0) return defaultMs;

    switch (unit) {
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        case 'd': return value * 24 * 60 * 60 * 1000;
        case 'w': return value * 7 * 24 * 60 * 60 * 1000;
        case 'M': return value * 30 * 24 * 60 * 60 * 1000;
        default: return defaultMs;
    }
}

export interface TimeframeResolution {
    base: string;
    intervalMs: number;
    isSynthetic: boolean;
    multiplier: number;
}

/**
 * Resolves the optimal base timeframe for a requested timeframe.
 * If the requested TF is native, returns it as base.
 * If not, finds the largest native TF that cleanly divides the requested TF.
 * 
 * @param targetTf The desired timeframe (e.g. "20m", "6m")
 * @param nativeTfs List of natively supported timeframes (e.g. ["1m", "5m", ...])
 */
export function getOptimalTimeframe(targetTf: string, nativeTfs: string[]): TimeframeResolution {
    const targetMs = safeTfToMs(targetTf);
    
    // 1. Check for exact match
    if (nativeTfs.includes(targetTf)) {
        return { base: targetTf, intervalMs: targetMs, isSynthetic: false, multiplier: 1 };
    }

    // 2. Find best divisor
    // Sort natives by duration descending to find largest chunks first
    const sortedNatives = nativeTfs
        .map(tf => ({ tf, ms: safeTfToMs(tf) }))
        .sort((a, b) => b.ms - a.ms);

    for (const native of sortedNatives) {
        if (native.ms > 0 && targetMs >= native.ms && targetMs % native.ms === 0) {
            return {
                base: native.tf,
                intervalMs: targetMs, // The TARGET interval in ms
                isSynthetic: true,
                multiplier: targetMs / native.ms
            };
        }
    }

    // Fallback: If no clean divisor found (unlikely if 1m is present), defaults to target (will likely fail API)
    // or return 1m if available?
    // For now, let's return target and let it fail or be handled by 1m if 1m is supported.
    // Actually, if we have 1m, it should have matched above.
    return { base: targetTf, intervalMs: targetMs, isSynthetic: false, multiplier: 1 };
}

