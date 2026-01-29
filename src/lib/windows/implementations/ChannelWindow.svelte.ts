/*
  Copyright (C) 2026 MYDCT
  Channel Window Implementation (Space/Market Channels)
*/

import { WindowBase } from "../WindowBase.svelte";
import IframeView from "./IframeView.svelte";

export class ChannelWindow extends WindowBase {
    url: string;

    constructor(url: string, title = "Galaxy Chat") {
        super({
            title,
            width: 768,
            height: 540
        });
        this.url = url;

        // --- FEATURE FLAGS ---
        this.showCachyIcon = true;
        this.allowZoom = false;
        this.allowFontSize = false;

        this.enableBurningBorders = false;
        this.burnIntensity = 1.2; // Extra intensity for market channels

        this.isDraggable = true;
        this.isResizable = true;
        this.closeOnBlur = false;
    }

    get component() {
        return IframeView;
    }

    get componentProps() {
        return { url: this.url };
    }
}
