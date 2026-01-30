/*
  Copyright (C) 2026 MYDCT
  News Window Implementation - All Flags Prepared
*/

import { WindowBase } from "../WindowBase.svelte";
import NewsSentimentPanel from "../../../components/shared/NewsSentimentPanel.svelte";

export class NewsFrameWindow extends WindowBase {
    constructor(title = "Market News") {
        super({
            title,
            width: 640,
            height: 480
        });

        // --- ALL FLAGS INITIALIZED (Disabled by default) ---

        // UI Features
        this.showCachyIcon = false;
        this.allowZoom = false;
        this.allowFontSize = false;

        // Visual Effects
        this.enableGlassmorphism = false;
        this.enableBurningBorders = false;
        this.burnIntensity = 0.5;
        this.isTransparent = false;
        this.opacity = 1.0;

        // Interaction
        this.isDraggable = true;
        this.isResizable = true;
        this.closeOnBlur = false;
    }

    get component() {
        return NewsSentimentPanel;
    }
}
