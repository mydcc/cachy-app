/*
  Copyright (C) 2026 MYDCT
  Robust Base Class for UI Windows using Svelte 5 Runes
*/

import type { WindowType, WindowOptions } from "./types";
import { windowRegistry } from "./WindowRegistry.svelte";

export abstract class WindowBase {
    id: string = crypto.randomUUID();
    windowType: WindowType = $state("window");
    private _title = $state("");
    get title() { return this._title; }
    set title(value) { this._title = value; }
    x = $state(0);
    y = $state(0);
    width = $state(640);
    height = $state(480);
    zIndex = $state(100);
    isFocused = $state(false);

    // --- STATE RUNES ---
    isMaximized = $state(false);
    isMinimized = $state(false);
    isResizable = $state(true);
    isDraggable = $state(true);
    isTransparent = $state(false);
    isPinned = $state(false); // i3-style tiling state

    // Pre-maximize storage
    private lastX = 0;
    private lastY = 0;
    private lastWidth = 640;
    private lastHeight = 480;

    // --- CONFIG FLAGS (From Registry) ---
    showCachyIcon = $state(false);
    allowZoom = $state(false);
    allowFontSize = $state(false);
    allowMaximize = $state(true);
    allowMinimize = $state(true);
    showMaximizeButton = $state(true);
    showMinimizeButton = $state(true);
    canMinimizeToPanel = $state(true);
    persistent = $state(true);
    allowMultipleInstances = $state(false);
    centerByDefault = $state(false);
    showHeaderIndicators = $state(false);
    allowFeedDuck = $state(true);

    // --- INTERACTIVE FLAGS ---
    headerAction: 'toggle-mode' | 'none' = $state('none');
    headerButtons: ('zoom' | 'export' | 'delete' | 'custom')[] = $state([]);
    pinSide: 'left' | 'right' | 'top' | 'bottom' | 'none' = $state('none');
    doubleClickBehavior: 'maximize' | 'pin' = $state('maximize');
    headerControls = $state<any[]>([]); // Custom buttons in header (e.g. for Chart TFs)

    // --- VISUALS ---
    enableGlassmorphism = $state(true);
    enableBurningBorders = $state(true);
    opacity = $state(1.0);
    closeOnBlur = $state(false);

    // --- FEATURE STATE ---
    fontSize = $state(14);
    zoomLevel = $state(1.0);
    burnIntensity = $state(1.0);
    aspectRatio: number | null = $state(null);
    headerSnippet = $state<any>(null);
    minWidth = 200;
    minHeight = 150;

    static staggerCount = 0;

    constructor(options: WindowOptions = {}) {
        this.title = options.title || "";
        this.windowType = options.windowType || "window";

        // Apply Registry Defaults
        // Initialize state, then apply config, then restore from localStore
        const config = windowRegistry.getConfig(this.windowType);
        this.applyConfig(config);

        // Stabilize ID for singletons if no specific ID provided
        if (options.id) {
            this.id = options.id;
        } else if (!this.allowMultipleInstances) {
            this.id = this.windowType;
        }

        if (options.opacity !== undefined) this.opacity = options.opacity;
        this.closeOnBlur = options.closeOnBlur ?? this.closeOnBlur;

        if (options.visuals) {
            if (options.visuals.glass !== undefined) this.enableGlassmorphism = options.visuals.glass;
            if (options.visuals.burn !== undefined) this.enableBurningBorders = options.visuals.burn;
            if (options.visuals.opacity !== undefined) this.opacity = options.visuals.opacity;
        }

        // --- RESTORE FROM PERSISTENCE ---
        this.restoreState();

        // Stagger if NO position was provided through options OR restored
        if (typeof window !== 'undefined' && options.x === undefined && options.y === undefined && !this.hasRestoredPosition) {
            const stagger = this.centerByDefault ? 0 : (WindowBase.staggerCount % 10) * 20;
            this.x = (window.innerWidth - this.width) / 2 + stagger;
            this.y = (window.innerHeight - this.height) / 2 + stagger;

            if (!this.centerByDefault) {
                WindowBase.staggerCount++;
            }
        }
    }

    private hasRestoredPosition = false;

    private get storageKey() {
        return `cachy_win_${this.id}`;
    }

    public saveState() {
        if (typeof localStorage === 'undefined') return;
        const state = {
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height,
            isMaximized: this.isMaximized,
            isPinned: this.isPinned,
            opacity: this.opacity,
            fontSize: this.fontSize,
            zoomLevel: this.zoomLevel
        };
        localStorage.setItem(this.storageKey, JSON.stringify(state));
    }

    private restoreState() {
        if (typeof localStorage === 'undefined') return;
        try {
            const saved = localStorage.getItem(this.storageKey);
            if (saved) {
                const state = JSON.parse(saved);
                this.x = state.x ?? this.x;
                this.y = state.y ?? this.y;
                this.width = state.width ?? this.width;
                this.height = state.height ?? this.height;
                this.isMaximized = state.isMaximized ?? false;
                this.isPinned = state.isPinned ?? false;
                this.opacity = state.opacity ?? this.opacity;
                this.fontSize = state.fontSize ?? this.fontSize;
                this.zoomLevel = state.zoomLevel ?? this.zoomLevel;
                if (state.x !== undefined || state.y !== undefined) {
                    this.hasRestoredPosition = true;
                }
            }
        } catch (e) {
            console.error("Failed to restore window state:", e);
        }
    }

    private applyConfig(config: any) {
        // Flags
        const f = config.flags;
        this.isResizable = f.isResizable ?? true;
        this.isDraggable = f.isDraggable ?? true;
        this.isTransparent = f.isTransparent ?? false;
        this.enableGlassmorphism = f.enableGlassmorphism ?? true;
        this.enableBurningBorders = f.enableBurningBorders ?? true;
        this.showCachyIcon = f.showCachyIcon ?? false;
        this.allowZoom = f.allowZoom ?? false;
        this.allowFontSize = f.allowFontSize ?? false;
        this.allowMaximize = f.allowMaximize ?? true;
        this.allowMinimize = f.allowMinimize ?? true;
        this.showMaximizeButton = f.showMaximizeButton ?? this.allowMaximize;
        this.showMinimizeButton = f.showMinimizeButton ?? this.allowMinimize;
        this.canMinimizeToPanel = f.canMinimizeToPanel ?? true;
        this.persistent = f.persistent ?? true;
        this.allowMultipleInstances = f.allowMultipleInstances ?? false;
        this.centerByDefault = f.centerByDefault ?? false;
        this.showHeaderIndicators = f.showHeaderIndicators ?? false;
        this.allowFeedDuck = f.allowFeedDuck ?? true;

        this.headerAction = f.headerAction ?? 'none';
        this.headerButtons = f.headerButtons ?? [];
        this.pinSide = f.pinSide ?? 'none';
        this.doubleClickBehavior = f.doubleClickBehavior ?? 'maximize';

        // Layout
        const l = config.layout;
        this.width = l.width ?? 640;
        this.height = l.height ?? 480;
        this.minWidth = l.minWidth ?? 200;
        this.minHeight = l.minHeight ?? 150;
        this.aspectRatio = l.aspectRatio ?? null;

        if (config.opacity !== undefined) this.opacity = config.opacity;
        if (config.defaultTitle && !this.title) this.title = config.defaultTitle;
    }

    // Abstract property to define which Svelte component to render inside
    abstract get component(): any;

    get componentProps(): Record<string, any> {
        return {};
    }

    focus() {
        this.isFocused = true;
    }

    updatePosition(x: number, y: number) {
        if (this.isMaximized) return; // Locked when maximized

        // Window Confinement Logic
        // Prevent window from moving more than 62% off-screen
        if (typeof window !== 'undefined') {
            const screenWidth = window.innerWidth;
            // const screenHeight = window.innerHeight; // Not strictly needed for bottom constraint if we just want to avoid losing it top

            const minVisible = this.width * 0.38; // 38% must remain visible

            // Left constraint: x must be >= -width + minVisible
            const minX = -(this.width - minVisible);

            // Right constraint: x must be <= screenWidth - minVisible
            const maxX = screenWidth - minVisible;

            // Apply X constraints
            this.x = Math.max(minX, Math.min(maxX, x));

            // Top constraint: y must be >= 0 (keep header accessible)
            // Bottom constraint: prevent moving too far down (keep 38% visible)
            const screenHeight = window.innerHeight;
            const minVisibleY = this.height * 0.38;
            const maxY = screenHeight - minVisibleY;

            this.y = Math.max(0, Math.min(maxY, y));
        } else {
            this.x = x;
            this.y = y;
        }
    }

    updateSize(width: number, height: number) {
        if (this.isMaximized) return; // Locked when maximized

        let newWidth = Math.max(width, this.minWidth);
        let newHeight = Math.max(height, this.minHeight);

        if (this.aspectRatio) {
            const HEADER_HEIGHT = 41;
            newHeight = Math.round((newWidth / this.aspectRatio) + HEADER_HEIGHT);
        }

        this.width = Math.round(newWidth);
        this.height = Math.round(newHeight);
    }

    toggleMaximize() {
        if (!this.allowMaximize) return;

        if (this.isMaximized) {
            this.restore();
        } else {
            this.maximize();
        }
    }

    maximize() {
        if (typeof window === 'undefined') return;
        this.lastX = this.x;
        this.lastY = this.y;
        this.lastWidth = this.width;
        this.lastHeight = this.height;

        this.x = 0;
        this.y = 0;
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.isMaximized = true;
    }

    restore() {
        if (!this.isMaximized && !this.isMinimized) return;
        this.x = this.lastX;
        this.y = this.lastY;
        this.width = this.lastWidth;
        this.height = this.lastHeight;
        this.isMaximized = false;
        this.isMinimized = false;
    }

    minimize() {
        if (!this.allowMinimize) return;
        this.isMinimized = true;
        this.isFocused = false;
    }

    togglePin() {
        if (this.pinSide === 'none') return;
        this.isPinned = !this.isPinned;
        if (this.isPinned) {
            this.isMaximized = false;
            // When pinning, we might want to store floating pos if not already stored
        }
    }

    // --- HEADER EVENT HOOKS ---
    onHeaderTitleClick() {
        // Implementation in subclasses
    }

    onHeaderExport() {
        // Implementation in subclasses
    }

    onHeaderDelete() {
        // Implementation in subclasses
    }

    onHeaderCustomAction() {
        // Implementation in subclasses
    }

    // --- CORE FEATURE METHODS ---
    zoomIn() { if (this.allowZoom) this.zoomLevel = Math.min(this.zoomLevel + 0.1, 2.0); }
    zoomOut() { if (this.allowZoom) this.zoomLevel = Math.max(this.zoomLevel - 0.1, 0.5); }
    resetZoom() { if (this.allowZoom) this.zoomLevel = 1.0; }

    setFontSize(size: number) { if (this.allowFontSize) this.fontSize = Math.min(Math.max(size, 8), 32); }
}
