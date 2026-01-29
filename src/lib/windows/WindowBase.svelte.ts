/*
  Copyright (C) 2026 MYDCT
  Robust Base Class for UI Windows using Svelte 5 Runes
*/

export abstract class WindowBase {
    id: string = crypto.randomUUID();
    title = $state("");
    x = $state(0);
    y = $state(0);
    width = $state(640);
    height = $state(480);
    zIndex = $state(100);
    isFocused = $state(false);
    minWidth = 200;
    minHeight = 150;

    // --- FEATURE FLAGS (Opt-in system) ---
    showCachyIcon = $state(false);
    allowZoom = $state(false);
    allowFontSize = $state(false);
    enableBurningBorders = $state(true);
    isDraggable = $state(true);
    isResizable = $state(true);
    isTransparent = $state(false);
    opacity = $state(1.0);
    closeOnBlur = $state(false);

    // --- FEATURE STATE ---
    fontSize = $state(14);
    zoomLevel = $state(1.0);
    burnIntensity = $state(1.0);
    aspectRatio: number | null = $state(null); // Width / Height

    static staggerCount = 0;

    constructor(options: { title: string; width?: number; height?: number; x?: number; y?: number }) {
        this.title = options.title;
        // Use updateSize to ensure aspect ratio logic (and header compensation) runs immediately
        this.updateSize(
            options.width ?? 640,
            options.height ?? 480
        );

        // Intelligent positioning & staggering
        if (typeof window !== 'undefined') {
            const stagger = (WindowBase.staggerCount % 10) * 25;
            // Default to 20, 20 (top-left) as requested, plus staggering offset
            this.x = options.x ?? 100 + stagger;
            this.y = options.y ?? 100 + stagger;
            WindowBase.staggerCount++;
        } else {
            this.x = options.x ?? 100;
            this.y = options.y ?? 100;
        }
    }

    // Abstract property to define which Svelte component to render inside
    abstract get component(): any;

    focus() {
        this.isFocused = true;
    }

    updatePosition(x: number, y: number) {
        this.x = x;
        this.y = y;
    }

    updateSize(width: number, height: number) {
        let newWidth = Math.max(width, this.minWidth);
        let newHeight = Math.max(height, this.minHeight);

        if (this.aspectRatio) {
            const HEADER_HEIGHT = 41; // Corrected: 8px pad + 24px btn + 8px pad + 1px border
            // The ratio applies to the content, so Height = (Width / Ratio) + Header
            newHeight = Math.round((newWidth / this.aspectRatio) + HEADER_HEIGHT);
        }

        this.width = Math.round(newWidth);
        this.height = Math.round(newHeight);
    }

    // --- CORE FEATURE METHODS ---
    zoomIn() { if (this.allowZoom) this.zoomLevel = Math.min(this.zoomLevel + 0.1, 2.0); }
    zoomOut() { if (this.allowZoom) this.zoomLevel = Math.max(this.zoomLevel - 0.1, 0.5); }
    resetZoom() { if (this.allowZoom) this.zoomLevel = 1.0; }

    setFontSize(size: number) { if (this.allowFontSize) this.fontSize = Math.min(Math.max(size, 8), 32); }
}
