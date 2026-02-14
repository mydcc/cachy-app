/*
 * Copyright (C) 2026 MYDCT
 *
 * UI Constants and Utilities
 */

/**
 * Calculates the step size for price inputs based on the price magnitude.
 * Used to provide appropriate precision for different asset classes (e.g. BTC vs SHIB).
 *
 * @param price The current price
 * @returns The step size (e.g. 0.01, 0.000001)
 */
export function calculatePriceStep(price: number): number {
    if (isNaN(price) || price === 0) return 0.01;

    // Dynamic precision for low-sat assets vs high-value assets
    if (price > 1000) return 0.5;
    if (price > 100) return 0.1;
    if (price > 1) return 0.01;
    if (price > 0.01) return 0.0001;
    if (price > 0.0001) return 0.000001;
    return 0.00000001;
}
