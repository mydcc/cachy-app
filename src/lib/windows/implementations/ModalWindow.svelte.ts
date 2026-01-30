/*
  Copyright (C) 2026 MYDCT
  Modal Window Implementation
*/

import { WindowBase } from "../WindowBase.svelte";

export class ModalWindow extends WindowBase {
    private _component: any;
    backdrop = $state(true);

    constructor(component: any, title: string, options: any = {}) {
        super({ title, ...options });
        this._component = component;
        this.windowType = 'modal';
        this.backdrop = options.backdrop ?? true;

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
        return this._component;
    }
}
