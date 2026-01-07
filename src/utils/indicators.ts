import { Decimal } from 'decimal.js';

export const indicators = {
    /**
     * Calculates the Relative Strength Index (RSI).
     * @param prices Array of prices (must be numbers or numeric strings). Ordered OLD -> NEW.
     * @param period Period length (default 14).
     * @returns The RSI value as a Decimal (0-100), or null if insufficient data.
     */
    calculateRSI(prices: (number | string | Decimal)[], period: number = 14): Decimal | null {
        if (prices.length < period + 1) {
            return null;
        }

        // Convert all to Decimals
        const decPrices = prices.map(p => new Decimal(p));

        // Calculate Changes
        const changes: Decimal[] = [];
        for (let i = 1; i < decPrices.length; i++) {
            changes.push(decPrices[i].minus(decPrices[i - 1]));
        }

        // Calculate initial Gain/Loss (Simple Average) for the first 'period'
        let gainSum = new Decimal(0);
        let lossSum = new Decimal(0);

        for (let i = 0; i < period; i++) {
            const change = changes[i];
            if (change.gt(0)) {
                gainSum = gainSum.plus(change);
            } else {
                lossSum = lossSum.plus(change.abs());
            }
        }

        let avgGain = gainSum.div(period);
        let avgLoss = lossSum.div(period);

        // Calculate Smoothed Averages for the rest
        // Wilder's Smoothing Method: Previous Avg * (Period - 1) + Current / Period
        for (let i = period; i < changes.length; i++) {
            const change = changes[i];
            const currentGain = change.gt(0) ? change : new Decimal(0);
            const currentLoss = change.lt(0) ? change.abs() : new Decimal(0);

            avgGain = avgGain.times(period - 1).plus(currentGain).div(period);
            avgLoss = avgLoss.times(period - 1).plus(currentLoss).div(period);
        }

        if (avgLoss.isZero()) {
            return new Decimal(100);
        }

        if (avgGain.isZero()) {
            return new Decimal(0);
        }

        const rs = avgGain.div(avgLoss);
        const rsi = new Decimal(100).minus(new Decimal(100).div(new Decimal(1).plus(rs)));

        return rsi;
    }
};
