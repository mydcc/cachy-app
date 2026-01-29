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

        // --- ALL FLAGS INITIALIZED (Set to false as requested) ---

        // UI Features
        this.showCachyIcon = true;
        this.allowZoom = false;
        this.allowFontSize = false;

        // Visual Effects
        this.enableBurningBorders = false; // Chat schlicht halten
        this.burnIntensity = 0.5;
        this.isTransparent = false;
        this.opacity = 0.95; // Leicht transparent für den Chat

        // Interaction
        this.isDraggable = true;
        this.isResizable = true;
        this.closeOnBlur = false; // Chat soll offen bleiben
    }

    get component() {
        return ChatTestView;
    }
}
