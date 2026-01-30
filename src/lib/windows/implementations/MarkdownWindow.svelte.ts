/*
  Copyright (C) 2026 MYDCT
  Markdown Window Implementation
*/

import { WindowBase } from "../WindowBase.svelte";
import MarkdownView from "./MarkdownView.svelte";

export class MarkdownWindow extends WindowBase {
    content: string;

    constructor(content: string, title: string, options: any = {}) {
        super({
            title,
            width: 1024,
            height: 768,
            ...options
        });
        this.content = content;
        this.windowType = 'modal';

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
        this.opacity = 1.0;

        // Interaction
        this.isDraggable = true;  // Usability default
        this.isResizable = true;  // Usability default
        this.closeOnBlur = false;
    }

    get component() {
        return MarkdownView;
    }
}
