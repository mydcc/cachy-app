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
