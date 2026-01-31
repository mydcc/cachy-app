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
