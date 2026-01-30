/*
  Copyright (C) 2026 MYDCT
  Chat Window Implementation - All Flags Prepared
*/

import { WindowBase } from "../WindowBase.svelte";
import ChatTestView from "./ChatTestView.svelte";

export class ChatWindow extends WindowBase {
    constructor(title = "Global Chat") {
        super({
            title,
            width: 350,
            height: 450
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
        return ChatTestView;
    }
}
