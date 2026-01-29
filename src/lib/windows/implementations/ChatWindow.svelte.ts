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
            height: 450,
            x: 150,
            y: 150
        });

        // --- ALL FLAGS INITIALIZED ---
        this.showCachyIcon = false;
        this.allowZoom = false;
        this.allowFontSize = false;

        this.enableBurningBorders = false; // Chat schlicht halten
        this.burnIntensity = 0.5;
        this.isTransparent = false;
        this.opacity = 0.95; // Leicht transparent für den Chat

        this.isDraggable = true;
        this.isResizable = true;
    }

    get component() {
        return ChatTestView;
    }
}
