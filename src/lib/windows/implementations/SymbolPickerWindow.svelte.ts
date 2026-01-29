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
            width: 850,
            height: 600
        });

        // --- FEATURE FLAGS ---
        this.showCachyIcon = true;
        this.allowZoom = false; // No zoom needed for picker
        this.allowFontSize = false;

        this.enableBurningBorders = true;
        this.burnIntensity = 0.8;

        this.isDraggable = true;
        this.isResizable = true;
        this.closeOnBlur = true; // Essential for a "picker"
    }

    get component() {
        return SymbolPickerView;
    }
}
