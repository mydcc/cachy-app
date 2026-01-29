/*
  Copyright (C) 2026 MYDCT
  Iframe Window Implementation - All Flags Prepared
*/

import { WindowBase } from "../WindowBase.svelte";
import IframeView from "./IframeView.svelte";

export class IframeWindow extends WindowBase {
    url: string;

    constructor(url: string, title: string, options: { x?: number; y?: number } = {}) {
        const width = Math.min(window.innerWidth * 0.8, 800);
        const height = Math.min(window.innerHeight * 0.8, 600);

        // Pass x and y if provided in options, else rely on auto-centering
        super({
            title,
            width,
            height,
            x: options.x,
            y: options.y
        });
        this.url = url;

        // --- ALL FLAGS INITIALIZED (Set to false for testing) ---

        // UI Features
        this.showCachyIcon = true;
        this.allowZoom = true;
        this.allowFontSize = false;

        // Visual Effects
        this.enableBurningBorders = true;
        this.burnIntensity = 1.0;
        this.isTransparent = false;
        this.opacity = 1.0;

        // Interaction
        this.isDraggable = true;
        this.isResizable = true;
        this.closeOnBlur = false; // Artikel sollen offen bleiben beim App-Klick
    }

    get component() {
        return IframeView;
    }
}
