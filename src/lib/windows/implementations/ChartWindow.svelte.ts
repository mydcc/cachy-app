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
import CandleChartView from "./CandleChartView.svelte";

export class ChartWindow extends WindowBase {
    symbol = $state("");
    timeframe = $state("1h");

    constructor(symbol: string, options: any = {}) {
        super({
            id: `chart-${symbol}`,
            title: symbol,
            width: 800,
            height: 500,
            windowType: "chart",
            ...options
        });
        this.symbol = symbol;
        this.updateHeaderControls();
    }

    updateHeaderControls() {
        const tfs = ["1m", "5m", "15m", "1h", "4h", "1d"];
        this.headerControls = tfs.map(tf => ({
            label: tf,
            active: this.timeframe === tf,
            action: () => {
                this.timeframe = tf;
                this.updateHeaderControls();
            }
        }));
    }

    get component() {
        return CandleChartView;
    }

    get componentProps() {
        return {
            symbol: this.symbol,
            timeframe: this.timeframe,
            setTimeframe: (tf: string) => {
                this.timeframe = tf;
                this.updateHeaderControls();
            }
        };
    }
}
