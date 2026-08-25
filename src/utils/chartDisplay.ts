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

/**
 * Pure helpers for the CandleChartView settings feature: timeframe math for
 * the candle-close countdown and price-decimal resolution shared by the
 * chart's price axis and the window header's current-price display.
 *
 * Kept framework-agnostic (no Svelte imports, no stores) so everything is
 * unit-testable without a DOM.
 */

const UNIT_MS = { m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

export interface ParsedTimeframe {
    value: number;
    unit: "m" | "h" | "d" | "w" | "M";
}

/** Parses Cachy timeframe strings like "5m", "1h", "3d", "1w", "1M". */
export function parseTimeframe(tf: string): ParsedTimeframe | null {
    const match = /^(\d+)([mhdwM])$/.exec(tf);
    if (!match) return null;
    const value = Number(match[1]);
    if (!Number.isFinite(value) || value <= 0) return null;
    return { value, unit: match[2] as ParsedTimeframe["unit"] };
}

/**
 * Fixed duration of a timeframe in ms. Calendar months are excluded on
 * purpose — they range from 28 to 31 days, so callers must use
 * `nextCandleCloseTime` instead.
 */
export function timeframeDurationMs(tf: string): number | null {
    const parsed = parseTimeframe(tf);
    if (!parsed) return null;
    switch (parsed.unit) {
        case "m":
            return parsed.value * UNIT_MS.m;
        case "h":
            return parsed.value * UNIT_MS.h;
        case "d":
            return parsed.value * UNIT_MS.d;
        case "w":
            return parsed.value * 7 * UNIT_MS.d;
        case "M":
            return null;
    }
}

/**
 * Close time of the candle that opened at `openTimeMs`. Calendar months use
 * UTC month arithmetic on the candle's own open stamp, matching how
 * exchanges emit monthly candles (open at month start UTC). Exchanges never
 * open a month mid-month in practice, which also sidesteps the JS
 * setUTCMonth day-overflow quirk.
 */
export function nextCandleCloseTime(
    openTimeMs: number,
    tf: string,
): number | null {
    if (!Number.isFinite(openTimeMs) || openTimeMs <= 0) return null;
    const parsed = parseTimeframe(tf);
    if (!parsed) return null;
    switch (parsed.unit) {
        case "m":
            return openTimeMs + parsed.value * UNIT_MS.m;
        case "h":
            return openTimeMs + parsed.value * UNIT_MS.h;
        case "d":
            return openTimeMs + parsed.value * UNIT_MS.d;
        case "w":
            return openTimeMs + parsed.value * 7 * UNIT_MS.d;
        case "M": {
            const d = new Date(openTimeMs);
            d.setUTCMonth(d.getUTCMonth() + parsed.value);
            return d.getTime();
        }
    }
}

/**
 * Countdown display text: `mm:ss`, escalating to `hh:mm:ss` and
 * `{days}d hh:mm:ss` for long timeframes.
 */
export function formatCountdown(msRemaining: number): string {
    const totalSec = Math.max(0, Math.floor(msRemaining / 1000));
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    const pad = (n: number): string => String(n).padStart(2, "0");
    if (days > 0) return `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    if (hours > 0) return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    return `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Effective price decimals for a symbol under the current Chart settings.
 * "auto" follows the exchange's quotePrecision (falls back to 2 while
 * metadata is still loading or missing); "fixed" uses the user value,
 * clamped to the 0-8 range the chart library can render sensibly.
 */
export function resolveChartPriceDecimals(
    mode: "auto" | "fixed",
    fixedDecimals: number,
    quotePrecision: number | undefined,
): number {
    if (mode === "fixed") {
        if (!Number.isFinite(fixedDecimals)) return 2;
        return Math.min(8, Math.max(0, Math.floor(fixedDecimals)));
    }
    if (
        typeof quotePrecision === "number" &&
        Number.isFinite(quotePrecision) &&
        quotePrecision >= 0
    ) {
        return Math.min(8, Math.floor(quotePrecision));
    }
    return 2;
}

/**
 * Maps the stored scale mode to lightweight-charts' `PriceScaleMode` enum
 * (Normal = 0, Logarithmic = 1). Single source of truth so a typo can never
 * silently put the chart into Percentage/IndexedTo100 territory again — the
 * rebasing modes were removed from settings on purpose (see
 * ChartPriceScaleMode): they rebase every value onto the first visible bar,
 * which makes absolute Entry/Liquidation/TP/SL price lines unreadable.
 * Unknown values fall back to Logarithmic, the long-standing hard-coded
 * behavior.
 */
export function mapPriceScaleMode(mode: "linear" | "log"): 0 | 1 {
    return mode === "linear" ? 0 : 1;
}
