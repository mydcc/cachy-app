/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

export enum TrendBias {
    BULLISH = 1,
    BEARISH = -1,
    NEUTRAL = 0
}

export interface Pivot {
    price: number;
    index: number;
    time: number; // timestamp
    type: 'HH' | 'HL' | 'LH' | 'LL';
    crossed: boolean;
}

export interface Structure {
    type: 'BOS' | 'CHOCH';
    bias: TrendBias;
    price: number;
    index: number;
    time: number;
    relatedPivot?: Pivot;
}

export interface OrderBlock extends MitigationZone {
    startTime: number;
}

export interface FairValueGap extends MitigationZone {
    startTime: number;
}

/**
 * Structural shape the sweep-line mitigation check operates on (FEAT-0538).
 * Order blocks and fair value gaps share these fields; the zone kind only
 * changes the activation offset and the overlap predicate, which the
 * wrappers inject.
 */
export interface MitigationZone {
    top: number;
    bottom: number;
    bias: TrendBias;
    startIndex: number;
    mitigated: boolean;
}

export interface SMCResult {
    swings: Pivot[];
    structures: Structure[];
    orderBlocks: OrderBlock[];
    fairValueGaps: FairValueGap[];
    currentTrend: TrendBias;
}
