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
 *
 * Reset-to-defaults helpers — FEAT-0342 slice F.
 *
 * The three `reset*` buttons in Settings (galaxy background, trade-flow
 * overlay, chart appearance) used to assign defaults inline in
 * `SettingsManager`. They now delegate here, following the same pattern as
 * `settings/accounts.ts`: this module computes nothing on its own, it
 * restores fields on a caller-supplied target, so it stays pure — no I/O,
 * no store reads, no Svelte runes — and is testable without a DOM.
 *
 * The manager keeps the reactive assignments (`this.<field> = …`), because
 * the autosave `$effect` tracks fields through `toJSON()`: moving a field
 * to another store would silently stop tracking it, but assigning through
 * the manager changes nothing about where the field lives.
 */

import type { GalaxySettings, Settings, TradeFlowSettings } from "./settingsTypes";

/** Fields `resetGalaxySettings` restores on its target. */
export interface GalaxyResetTarget {
    galaxySettings: GalaxySettings;
    backgroundOpacity: number;
    backgroundBlur: number;
}

/** Fields `resetTradeFlowSettings` restores on its target. */
export interface TradeFlowResetTarget {
    tradeFlowSettings: TradeFlowSettings;
}

/**
 * Every Settings → Chart field `resetChartSettings` restores. Kept as an
 * explicit key list (rather than reusing the manager type) so adding a
 * chart field without wiring it into the reset fails the type check at the
 * call site instead of silently leaving the button behind.
 */
export type ChartResetTarget = Pick<
    Settings,
    | "chartPriceScaleMode"
    | "chartAutoScale"
    | "chartInvertScale"
    | "chartDecimalsMode"
    | "chartFixedDecimals"
    | "chartShowGrid"
    | "chartLastValueVisible"
    | "chartCandleBorders"
    | "chartWatermark"
    | "chartCrosshairMode"
    | "chartCrosshairStyle"
    | "chartSecondsVisible"
    | "chartFixEdges"
    | "chartCountdownEnabled"
>;

/**
 * Restores the galaxy background on `target`.
 *
 * `backgroundBlur` is deliberately 0, not `defaults.backgroundBlur` (5):
 * the button restores a clean unblurred backdrop, while the shipped default
 * keeps a slight blur. Do not "simplify" this to the default.
 */
export function resetGalaxy(
    target: GalaxyResetTarget,
    defaults: Pick<Settings, "galaxySettings">,
): void {
    target.galaxySettings = {
        ...defaults.galaxySettings,
    };
    target.backgroundOpacity = 1;
    target.backgroundBlur = 0;
}

/** Restores the trade-flow overlay on `target` from a deep copy. */
export function resetTradeFlow(
    target: TradeFlowResetTarget,
    defaults: Pick<Settings, "tradeFlowSettings">,
): void {
    target.tradeFlowSettings = structuredClone(defaults.tradeFlowSettings);
}

/** Restores every Settings → Chart field on `target` (reset button). */
export function resetChart(target: ChartResetTarget, defaults: ChartResetTarget): void {
    target.chartPriceScaleMode = defaults.chartPriceScaleMode;
    target.chartAutoScale = defaults.chartAutoScale;
    target.chartInvertScale = defaults.chartInvertScale;
    target.chartDecimalsMode = defaults.chartDecimalsMode;
    target.chartFixedDecimals = defaults.chartFixedDecimals;
    target.chartShowGrid = defaults.chartShowGrid;
    target.chartLastValueVisible = defaults.chartLastValueVisible;
    target.chartCandleBorders = defaults.chartCandleBorders;
    target.chartWatermark = defaults.chartWatermark;
    target.chartCrosshairMode = defaults.chartCrosshairMode;
    target.chartCrosshairStyle = defaults.chartCrosshairStyle;
    target.chartSecondsVisible = defaults.chartSecondsVisible;
    target.chartFixEdges = defaults.chartFixEdges;
    target.chartCountdownEnabled = defaults.chartCountdownEnabled;
}
