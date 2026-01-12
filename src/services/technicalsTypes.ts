import { Decimal } from 'decimal.js';

export interface Kline {
    open: Decimal;
    high: Decimal;
    low: Decimal;
    close: Decimal;
    volume: Decimal;
    time: number; // Unix timestamp in ms
}

export interface IndicatorResult {
    name: string;
    params?: string; // e.g. "14, 14"
    value: Decimal;
    signal?: Decimal; // For MACD signal line, etc.
    histogram?: Decimal; // For MACD histogram
    action: 'Buy' | 'Sell' | 'Neutral';
}

export interface TechnicalsData {
    oscillators: IndicatorResult[];
    movingAverages: IndicatorResult[];
    pivots: {
        classic: {
            r3: Decimal;
            r2: Decimal;
            r1: Decimal;
            p: Decimal;
            s1: Decimal;
            s2: Decimal;
            s3: Decimal;
        };
    };
    pivotBasis?: {
        high: Decimal;
        low: Decimal;
        close: Decimal;
        open: Decimal;
    };
    summary: {
        buy: number;
        sell: number;
        neutral: number;
        action: 'Buy' | 'Sell' | 'Neutral';
    };
}
