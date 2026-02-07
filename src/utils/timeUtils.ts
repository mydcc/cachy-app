/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 */

/**
 * Converts a timeframe string (e.g., "15m", "4h", "1d") to milliseconds.
 * Defaults to 60000ms (1 minute) if invalid.
 * Supports: m (minute), h (hour), d (day), w (week), M (month - approx 30 days).
 */
export function tfToMs(tf: string): number {
    if (!tf) return 60000;
    const unit = tf.slice(-1);
    const val = parseInt(tf.slice(0, -1));
    if (isNaN(val)) return 60000;
    switch (unit) {
        case 'm': return val * 60 * 1000;
        case 'h': return val * 60 * 60 * 1000;
        case 'd': return val * 24 * 60 * 60 * 1000;
        case 'w': return val * 7 * 24 * 60 * 60 * 1000;
        case 'M': return val * 30 * 24 * 60 * 60 * 1000;
        default: return 60000;
    }
}
