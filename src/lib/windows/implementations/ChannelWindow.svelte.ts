/*
  Copyright (C) 2026 MYDCT
  Channel Window Implementation (Space/Market Channels)
*/

import { WindowBase } from "../WindowBase.svelte";
import IframeView from "./IframeView.svelte";

export class ChannelWindow extends WindowBase {
    url: string;

    constructor(url: string, title = "Galaxy Chat", id?: string) {
        super({
            title,
            width: 640,
            height: 401
        });
        if (id) this.id = id;
        this.url = url;

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

        // --- ASPECT RATIO (Approach 3 & 4) ---
        this.aspectRatio = 16 / 9; // Updated to 16:9 based on user CSS

        // Listen for internal unity messages (if on same domain)
        if (typeof window !== 'undefined') {
            window.addEventListener('message', this.handleUnityMessage);
        }
    }

    private handleUnityMessage = (event: MessageEvent) => {
        // Validation: Verify if the message comes from our expected URL or type
        if (event.data && event.data.type === 'unity-info') {
            const { width, height } = event.data;
            if (width && height) {
                this.aspectRatio = width / height;
                // Optionally auto-resize the window once to fit exactly
                this.updateSize(this.width, this.width / this.aspectRatio);
            }
        }
    };

    // Cleanup listener when needed (e.g. if window is destroyed)
    // In our system, the WindowManager handles the lifecycle

    get component() {
        return IframeView;
    }

    get componentProps() {
        return { url: this.url };
    }
}
