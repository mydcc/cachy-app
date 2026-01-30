/*
  Copyright (C) 2026 MYDCT
  Symbol Picker Window Implementation
*/

import { WindowBase } from "../WindowBase.svelte";
import SymbolPickerView from "./SymbolPickerView.svelte";

export class SymbolPickerWindow extends WindowBase {
    constructor() {
        super({
            title: "Symbol Selection",
            width: 800,
            height: 600
        });

        // --- ALL FLAGS INITIALIZED (Disabled by default) ---

        // UI Features
        this.showCachyIcon = true;
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
        return SymbolPickerView;
    }
}
