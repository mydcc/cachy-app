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
    val: number;
    color: string;
}

export class TechnicalsPresenter {

    /**
     * Calculates Bollinger Band Width %
     * Formula: ((Upper - Lower) / Middle) * 100
     */
    static calculateBollingerBandWidth(upper: number, lower: number, middle: number): number {
        if (middle === 0) return 0;
        return ((upper - lower) / middle) * 100;
    }

    /**
     * Determines the context (Overbought/Oversold) for oscillators
     */
    static getOscillatorContext(name: string, val: number, defaultAction: string = "Neutral"): string {
        if (name === "RSI") {
            if (val >= 70) return "Overbought";
            if (val <= 30) return "Oversold";
        }
        if (name === "Stoch" || name === "StochRSI") {
            if (val >= 80) return "Overbought";
            if (val <= 20) return "Oversold";
        }
        if (name === "Will %R") {
            if (val > -20) return "Overbought";
            if (val < -80) return "Oversold";
        }
        if (name === "CCI") {
            if (val > 100) return "Overbought";
            if (val < -100) return "Oversold";
        }
        if (name === "MFI") {
            if (val >= 80) return "Overbought";
            if (val <= 20) return "Oversold";
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
    static formatVal(val: number | undefined, precision: number = 4): string {
        if (val === undefined || val === null || isNaN(val)) return "-";
        return val.toFixed(precision);
    }

    /**
     * Prepares Pivot Points for iteration
     */
    static getPivotsArray(pivots: any): PivotDisplay[] {
        if (!pivots) return [];

        // Check for active pivot type
        let p = pivots.classic || pivots.woodie || pivots.camarilla || pivots.fibonacci;

        // Prioritize specific types if multiple exist (unlikely but safe)
        if (pivots.woodie) p = pivots.woodie;
        else if (pivots.camarilla) p = pivots.camarilla;
        else if (pivots.fibonacci) p = pivots.fibonacci;
        else if (pivots.classic) p = pivots.classic;

        if (!p) return [];

        const levels: PivotDisplay[] = [];

        // Add R4 (Camarilla)
        if (p.r4 !== undefined) levels.push({ label: "R4", val: p.r4, color: "text-[var(--danger-color)]" });

        levels.push(
            { label: "R3", val: p.r3, color: "text-[var(--danger-color)]" },
            { label: "R2", val: p.r2, color: "text-[var(--danger-color)]" },
            { label: "R1", val: p.r1, color: "text-[var(--danger-color)]" },
            { label: "P", val: p.p, color: "text-[var(--text-primary)]" },
            { label: "S1", val: p.s1, color: "text-[var(--success-color)]" },
            { label: "S2", val: p.s2, color: "text-[var(--success-color)]" },
            { label: "S3", val: p.s3, color: "text-[var(--success-color)]" }
        );

        // Add S4 (Camarilla)
        if (p.s4 !== undefined) levels.push({ label: "S4", val: p.s4, color: "text-[var(--success-color)]" });

        return levels;
    }

    static getSuperTrendColor(trend: string): string {
        return trend === 'bull' ? 'text-[var(--success-color)]' : 'text-[var(--danger-color)]';
    }

    static getDivergenceColor(side: string): string {
        return side === 'Bullish' ? 'text-[var(--success-color)]' : 'text-[var(--danger-color)]';
    }
}
