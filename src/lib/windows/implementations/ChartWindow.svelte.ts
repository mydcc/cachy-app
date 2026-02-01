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
  Copyright (C) 2026 MYDCT
  Chart Window Implementation using Lightweight Charts
*/

import { WindowBase } from "../WindowBase.svelte";
import { windowManager } from "../WindowManager.svelte";
import { tradeState } from "../../../stores/trade.svelte";
import CandleChartView from "./CandleChartView.svelte";

/**
 * ChartWindow is a specific implementation of WindowBase that renders
 * a financial chart using CandleChartView.
 * 
 * Features:
 * - Timeframe selection in the header.
 * - Integration with tradeState (syncing symbol selection).
 * - Price-in-title display toggle via context menu.
 */
export class ChartWindow extends WindowBase {
    /** The active aggregation interval (e.g., 1h, 15m). */
    timeframe = $state("1h");

    constructor(symbol: string, options: any = {}) {
        super({
            id: `chart-${symbol}`,
            title: symbol,
            symbol: symbol,
            width: 800,
            height: 500,
            windowType: "chart",
            ...options
        });
        this.headerAction = 'toggle-mode';
        this.updateHeaderControls();
    }

    /**
     * Generates the timeframe buttons displayed in the window header.
     * Updates whenever the active timeframe changes.
     */
    updateHeaderControls() {
        const tfs = ["3m", "5m", "15m", "1h", "4h", "1d"];
        this.headerControls = tfs.map(tf => ({
            label: tf,
            active: this.timeframe === tf,
            action: () => {
                this.timeframe = tf;
                this.updateHeaderControls();
            }
        }));
    }

    /** The Svelte component used to render the chart content. */
    get component() {
        return CandleChartView;
    }

    /** Mapping of logic state to component props. */
    get componentProps() {
        return {
            symbol: this.symbol,
            timeframe: this.timeframe,
            showPriceInTitle: this.showPriceInTitle,
            setTimeframe: (tf: string) => {
                this.timeframe = tf;
                this.updateHeaderControls();
            }
        };
    }

    // --- INTERACTION HOOKS ---

    /**
     * Triggered when the user clicks the symbol/title in the header.
     * Synchronizes the global application state to this symbol.
     */
    onHeaderTitleClick() {
        tradeState.setSymbol(this.symbol);
    }

    /**
     * Extends the base context menu with chart-specific actions.
     */
    public getContextMenuActions(): any[] {
        return [
            {
                label: this.showPriceInTitle ? "✅ Show Price in Title" : "Show Price in Title",
                icon: "💰",
                active: this.showPriceInTitle,
                action: () => {
                    this.showPriceInTitle = !this.showPriceInTitle;
                    this.saveState();
                }
            },
            {
                label: "Fenster schließen",
                icon: "✕",
                danger: true,
                action: () => {
                    windowManager.close(this.id);
                }
            }
        ];
    }

    /** Reserved for future implementation: fit the chart to the viewport. */
    autoScale() {
        // Implementation logic if needed
    }

    public serialize(): any {
        return {
            ...super.serialize(),
            symbol: this.symbol,
            timeframe: this.timeframe
        };
    }
}
