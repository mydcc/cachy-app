/*
  Copyright (C) 2026 MYDCT
  News Window Implementation with Zoom and Font-Size support
*/

import { WindowBase } from "../WindowBase.svelte";
import NewsSentimentPanel from "../../../components/shared/NewsSentimentPanel.svelte";

export class NewsFrameWindow extends WindowBase {
    constructor(title = "Market News") {
        super({
            title,
            width: 700,
            height: 600,
            x: 200,
            y: 100
        });

        // Hier aktivieren wir die gewünschten Features
        this.allowZoom = true;       // Zoom-Buttons aktivieren
        this.allowFontSize = true;   // Schriftgrößensteuerung aktivieren
        this.showCachyIcon = true;   // Logo im Header anzeigen
        this.burnIntensity = 1.2;    // Etwas stärkerer Rahmen-Effekt für News
    }

    get component() {
        return NewsSentimentPanel;
    }
}
