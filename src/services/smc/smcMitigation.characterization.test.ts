/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * Characterization test for the sweep-line mitigation checks (FEAT-0538).
 *
 * Pins the mitigation decisions of `checkMitigation` (fair value gaps,
 * activation offset +3, one-sided overlap) and `checkMitigationOB` (order
 * blocks, activation offset +1, two-sided overlap) over bullish and bearish
 * zones. Written against the pre-refactor implementation; it must pass
 * unchanged after both are unified behind `checkZoneMitigation`, proving
 * identical decisions before/after.
 */

import { describe, it, expect } from 'vitest';
import { SMCService, type SMCCandle } from './smcService';
import { TrendBias, type FairValueGap, type OrderBlock } from './types';

function candle(time: number, open: number, high: number, low: number, close: number): SMCCandle {
    return { time, open, high, low, close };
}

function fvg(top: number, bottom: number, bias: TrendBias, startIndex: number): FairValueGap {
    return { top, bottom, bias, startIndex, startTime: startIndex, mitigated: false };
}

function ob(top: number, bottom: number, bias: TrendBias, startIndex: number): OrderBlock {
    return { top, bottom, bias, startIndex, startTime: startIndex, mitigated: false };
}

describe('mitigation characterization (FEAT-0538)', () => {
    it('mitigates a bullish FVG when price dips into the gap after activation', () => {
        const service = new SMCService(2);
        // Zone [90, 100], bullish, starts at 0 -> active from k=3.
        const zones = [fvg(100, 90, TrendBias.BULLISH, 0)];
        const candles = [
            candle(1, 105, 108, 104, 107),
            candle(2, 107, 109, 106, 108),
            candle(3, 108, 110, 107, 109),
            candle(4, 109, 111, 95, 100), // low 95 <= top 100 -> mitigated
        ];
        (service as unknown as { checkMitigation: (c: SMCCandle[], z: FairValueGap[]) => void })
            .checkMitigation(candles, zones);
        expect(zones[0].mitigated).toBe(true);
    });

    it('leaves a bullish FVG unmitigated while price stays above the gap', () => {
        const service = new SMCService(2);
        const zones = [fvg(100, 90, TrendBias.BULLISH, 0)];
        const candles = [
            candle(1, 105, 108, 104, 107),
            candle(2, 107, 109, 106, 108),
            candle(3, 108, 110, 107, 109),
            candle(4, 109, 112, 108, 111),
            candle(5, 111, 115, 110, 114),
        ];
        (service as unknown as { checkMitigation: (c: SMCCandle[], z: FairValueGap[]) => void })
            .checkMitigation(candles, zones);
        expect(zones[0].mitigated).toBe(false);
    });

    it('mitigates a bearish FVG when price rises into the gap after activation', () => {
        const service = new SMCService(2);
        const zones = [fvg(100, 90, TrendBias.BEARISH, 1)];
        const candles = [
            candle(1, 80, 82, 78, 79),
            candle(2, 79, 81, 77, 78),
            candle(3, 78, 80, 76, 77),
            candle(4, 77, 79, 75, 76),
            candle(5, 76, 95, 74, 90), // high 95 >= bottom 90 -> mitigated
        ];
        (service as unknown as { checkMitigation: (c: SMCCandle[], z: FairValueGap[]) => void })
            .checkMitigation(candles, zones);
        expect(zones[0].mitigated).toBe(true);
    });

    it('does not activate a zone before its +3 offset elapses', () => {
        const service = new SMCService(2);
        // Starts at 2 -> active from k=5; deep dip at k=3 must not mitigate.
        const zones = [fvg(100, 90, TrendBias.BULLISH, 2)];
        const candles = [
            candle(1, 105, 108, 104, 107),
            candle(2, 107, 109, 106, 108),
            candle(3, 108, 110, 107, 109),
            candle(4, 50, 55, 45, 52), // would mitigate if active
            candle(5, 108, 110, 107, 109),
            candle(6, 109, 112, 108, 111),
        ];
        (service as unknown as { checkMitigation: (c: SMCCandle[], z: FairValueGap[]) => void })
            .checkMitigation(candles, zones);
        expect(zones[0].mitigated).toBe(false);
    });

    it('mitigates a bullish OB on two-sided overlap after the +1 offset', () => {
        const service = new SMCService(2);
        // Starts at 0 -> active from k=1.
        const zones = [ob(100, 90, TrendBias.BULLISH, 0)];
        const candles = [
            candle(1, 105, 108, 104, 107),
            candle(2, 107, 101, 95, 96), // low 95 <= 100 && high 101 >= 90 -> mitigated
        ];
        (service as unknown as { checkMitigationOB: (c: SMCCandle[], z: OrderBlock[]) => void })
            .checkMitigationOB(candles, zones);
        expect(zones[0].mitigated).toBe(true);
    });

    it('leaves a bullish OB unmitigated on a one-sided touch (unlike FVG)', () => {
        const service = new SMCService(2);
        const zones = [ob(100, 90, TrendBias.BULLISH, 0)];
        const candles = [
            candle(1, 105, 108, 104, 107),
            // low 85 <= top 100 (FVG would mitigate) but high 88 < bottom 90:
            // one-sided, so the OB stays unmitigated.
            candle(2, 87, 88, 85, 86),
            candle(3, 105, 108, 104, 107),
        ];
        (service as unknown as { checkMitigationOB: (c: SMCCandle[], z: OrderBlock[]) => void })
            .checkMitigationOB(candles, zones);
        expect(zones[0].mitigated).toBe(false);
    });

    it('mitigates a bearish OB when price overlaps the zone', () => {
        const service = new SMCService(2);
        const zones = [ob(100, 90, TrendBias.BEARISH, 0)];
        const candles = [
            candle(1, 80, 82, 78, 79),
            candle(2, 79, 95, 85, 90), // high 95 >= 90 && low 85 <= 100 -> mitigated
        ];
        (service as unknown as { checkMitigationOB: (c: SMCCandle[], z: OrderBlock[]) => void })
            .checkMitigationOB(candles, zones);
        expect(zones[0].mitigated).toBe(true);
    });
});
