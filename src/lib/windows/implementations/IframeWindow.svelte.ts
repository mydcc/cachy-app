/*
  Copyright (C) 2026 MYDCT
  Iframe Window Implementation - All Flags Prepared
*/

import { WindowBase } from "../WindowBase.svelte";
import IframeView from "./IframeView.svelte";

export class IframeWindow extends WindowBase {
    url: string;

    constructor(url: string, title: string, options: any = {}) {
        const width = options.width ?? Math.min(window.innerWidth * 0.8, 800);
        const height = options.height ?? Math.min(window.innerHeight * 0.8, 600);

        super({
            title,
            width,
            height,
            ...options
        });
        this.url = url;

        // --- ALL FLAGS INITIALIZED (Disabled by default for fine-tuning) ---

        // UI Features
        this.showCachyIcon = true;
        this.allowZoom = false;
        this.allowFontSize = false;

        // Visual Effects
        this.enableGlassmorphism = false;
        this.enableBurningBorders = false;
        this.burnIntensity = 0.5;
        this.isTransparent = false;
        this.opacity = 0.9;

        // Interaction
        this.isDraggable = true; // Draggable should usually stay true for usability unless specified
        this.isResizable = true; // Resizable usually stays true
        this.closeOnBlur = false;
    }

    get component() {
        return IframeView;
    }
}
