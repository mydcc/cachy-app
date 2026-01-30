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
            ...options
        });
        this.symbol = symbol;

        // --- ALL FLAGS INITIALIZED (Disabled by default) ---
        this.showCachyIcon = false;
        this.allowZoom = false;
        this.allowFontSize = false;

        this.enableGlassmorphism = false;
        this.enableBurningBorders = false;
        this.burnIntensity = 0.5;
        this.isTransparent = false;
        this.opacity = 1.0;

        this.isDraggable = true;
        this.isResizable = true;
        this.closeOnBlur = false;
    }

    get component() {
        return CandleChartView;
    }

    get componentProps() {
        return { symbol: this.symbol };
    }
}
