/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * Copyright (C) 2026 MYDCT
 *
 * Technicals Presenter
 * Encapsulates presentation logic for technical indicators to keep UI dumb.
 */

import { Decimal } from "decimal.js";

interface PivotDisplay {
    label: string;
    val: Decimal;
    color: string;
}

export class TechnicalsPresenter {

    /**
     * Calculates Bollinger Band Width %
     * Formula: ((Upper - Lower) / Middle) * 100
     */
    static calculateBollingerBandWidth(upper: Decimal, lower: Decimal, middle: Decimal): Decimal {
        if (middle.isZero()) return new Decimal(0);
        return upper.minus(lower).div(middle).times(100);
    }

    /**
     * Determines the context (Overbought/Oversold) for oscillators
     */
    static getOscillatorContext(name: string, val: Decimal, defaultAction: string = "Neutral"): string {
        if (name === "RSI") {
            if (val.gte(70)) return "Overbought";
            if (val.lte(30)) return "Oversold";
        }
        if (name === "Stoch" || name === "StochRSI") {
            if (val.gte(80)) return "Overbought";
            if (val.lte(20)) return "Oversold";
        }
        if (name === "Will %R") {
            if (val.gt(-20)) return "Overbought";
            if (val.lt(-80)) return "Oversold";
        }
        if (name === "CCI") {
            if (val.gt(100)) return "Overbought";
            if (val.lt(-100)) return "Oversold";
        }
        if (name === "MFI") {
            if (val.gte(80)) return "Overbought";
            if (val.lte(20)) return "Oversold";
        }

        return defaultAction;
    }

    /**
     * Returns the Tailwind CSS class for an action
     */
    static getActionColor(action: string): string {
        const a = action.toLowerCase();
        if (a.includes("strong buy")) return "text-[#00ff88] font-bold";
        if (a.includes("strong sell")) return "text-[#ff0044] font-bold";
        if (a.includes("buy")) return "text-[var(--success-color)]";
        if (a.includes("sell")) return "text-[var(--danger-color)]";
        return "text-[var(--text-secondary)]";
    }

    /**
     * Formats a Decimal value with precision
     */
    static formatVal(val: Decimal | undefined, precision: number = 4): string {
        if (!val || !val.toDecimalPlaces) return "-";
        return val.toDecimalPlaces(precision).toString();
    }

    /**
     * Prepares Pivot Points for iteration
     */
    static getPivotsArray(pivots: any): PivotDisplay[] {
        if (!pivots || !pivots.classic) return [];

        const p = pivots.classic;
        return [
            { label: "R3", val: p.r3, color: "text-[var(--danger-color)]" },
            { label: "R2", val: p.r2, color: "text-[var(--danger-color)]" },
            { label: "R1", val: p.r1, color: "text-[var(--danger-color)]" },
            { label: "P", val: p.p, color: "text-[var(--text-primary)]" },
            { label: "S1", val: p.s1, color: "text-[var(--success-color)]" },
            { label: "S2", val: p.s2, color: "text-[var(--success-color)]" },
            { label: "S3", val: p.s3, color: "text-[var(--success-color)]" }
        ];
    }

    static getSuperTrendColor(trend: string): string {
        return trend === 'bull' ? 'text-[var(--success-color)]' : 'text-[var(--danger-color)]';
    }

    static getDivergenceColor(side: string): string {
        return side === 'Bullish' ? 'text-[var(--success-color)]' : 'text-[var(--danger-color)]';
    }
}
