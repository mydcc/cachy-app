/*
  Copyright (C) 2026 MYDCT
  Robust Base Class for UI Windows using Svelte 5 Runes
*/

export abstract class WindowBase {
    id: string = crypto.randomUUID();
    title = $state("");
    x = $state(0);
    y = $state(0);
    width = $state(800);
    height = $state(600);
    zIndex = $state(100);
    isFocused = $state(false);
    minWidth = 200;
    minHeight = 150;

    constructor(options: { title: string; width?: number; height?: number; x?: number; y?: number }) {
        this.title = options.title;
        if (options.width) this.width = options.width;
        if (options.height) this.height = options.height;
        if (options.x !== undefined) this.x = options.x;
        if (options.y !== undefined) this.y = options.y;
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
        this.width = Math.max(width, this.minWidth);
        this.height = Math.max(height, this.minHeight);
    }
}
