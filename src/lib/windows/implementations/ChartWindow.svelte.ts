/*
  Copyright (C) 2026 MYDCT
  Chart Window Implementation using Lightweight Charts
*/

import { WindowBase } from "../WindowBase.svelte";
import CandleChartView from "./CandleChartView.svelte";

export class ChartWindow extends WindowBase {
    symbol = $state("");

    constructor(symbol: string, options: any = {}) {
        super({
            id: `chart-${symbol}`,
            title: `Chart: ${symbol}`,
            width: 800,
            height: 500,
            windowType: "chart",
            ...options
        });
        this.symbol = symbol;
    }

    get component() {
        return CandleChartView;
    }

    get componentProps() {
        return { symbol: this.symbol };
    }
}
