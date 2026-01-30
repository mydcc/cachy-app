/*
  Copyright (C) 2026 MYDCT
  Generic Window for Svelte Components
*/

import { WindowBase } from "../WindowBase.svelte";

export class ContentWindow extends WindowBase {
    private _component: any;

    constructor(component: any, title: string, options: any = {}) {
        super({ title, ...options });
        this._component = component;

        // --- ALL FLAGS INITIALIZED (Disabled by default for fine-tuning) ---

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
        this.isDraggable = true;  // Usability default
        this.isResizable = true;  // Usability default
        this.closeOnBlur = false;
    }

    get component() {
        return this._component;
    }
}
