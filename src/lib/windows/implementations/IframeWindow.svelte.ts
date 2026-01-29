/*
  Copyright (C) 2026 MYDCT
  Iframe Window Implementation - All Flags Prepared
*/

import { WindowBase } from "../WindowBase.svelte";
import IframeView from "./IframeView.svelte";

export class IframeWindow extends WindowBase {
    url: string;

    constructor(url: string, title: string) {
        const width = Math.min(window.innerWidth * 0.8, 1024);
        const height = Math.min(window.innerHeight * 0.8, 768);

        // Wir übergeben KEINE x/y, damit die neue Auto-Zentrierung greift
        super({ title, width, height });
        this.url = url;

        // --- ALL FLAGS INITIALIZED ---
        this.showCachyIcon = true;
        this.allowZoom = true;
        this.allowFontSize = false;

        this.enableBurningBorders = true;
        this.burnIntensity = 1.0;
        this.isTransparent = false;
        this.opacity = 1.0;

        this.isDraggable = true;
        this.isResizable = true;
    }

    get component() {
        return IframeView;
    }
}
