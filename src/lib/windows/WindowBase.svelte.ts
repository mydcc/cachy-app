/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/*
  Copyright (C) 2026 MYDCT
  Robust Base Class for UI Windows using Svelte 5 Runes
*/

import type { WindowType, WindowOptions } from "./types";
import { windowRegistry } from "./WindowRegistry.svelte";

/**
 * WindowBase is the abstract foundation for all windows in the application.
 * It leverages Svelte 5 Runes ($state, $effect) for reactive property management.
 * 
 * Responsibilities:
 * - Geometric state (x, y, width, height)
 * - Window state (maximized, minimized, focused, pinned)
 * - Configuration inheritance from WindowRegistry
 * - State persistence to LocalStorage
 * - Responsive behavior (auto-maximize on mobile)
 * - Core feature logic (zoom, font size, headers)
 */
export abstract class WindowBase {
    /** Unique ID for this instance. Defaults to a random UUID. */
    id: string = crypto.randomUUID();
    /** Categorical type used for registry lookups and component selection. */
    windowType: WindowType = $state("window");

    // Internal title state with reactive getter/setter
    private _title = $state("");
    get title() { return this._title; }
    set title(value) { this._title = value; }

    // --- GEOMETRY (Reactive) ---
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
    /** Tiling/Pinning state (active if pinSide != 'none') */
    isPinned = $state(false);

    /** Storage for dimensions prior to maximization or pinning. */
    private lastX = 0;
    private lastY = 0;
    private lastWidth = 640;
    private lastHeight = 480;

    // --- CONFIG FLAGS (Usually set via Registry Defaults) ---
    showCachyIcon = $state(false);
    allowZoom = $state(false);
    allowFontSize = $state(false);
    allowMaximize = $state(true);
    allowMinimize = $state(true);
    showMaximizeButton = $state(true);
    showMinimizeButton = $state(true);
    /** If true, the window can stay as a small bar in the docking panel. */
    canMinimizeToPanel = $state(true);
    /** If true, state is persisted to LocalStorage. */
    persistent = $state(true);
    allowMultipleInstances = $state(false);
    centerByDefault = $state(false);
    showHeaderIndicators = $state(false);
    allowFeedDuck = $state(true);
    isResponsive = $state(false);
    /** Width threshold in pixels for automatic mobile maximization. */
    edgeToEdgeBreakpoint = 768;

    // --- HARMONIZATION & INTERACTION ---
    showIcon = $state(true);
    hasContextMenu = $state(false);
    doubleClickAction: 'maximize' | 'edgeToEdge' = $state('maximize');
    /** Max instances of this SPECIFIC window type. (0 = no limit) */
    maxInstances = $state(0);
    autoScaling = $state(false);
    showRightScale = $state(false);

    /** Header Title Click Behavior */
    headerAction: 'toggle-mode' | 'none' = $state('none');
    /** Array of standard button groups to render in header. */
    headerButtons: ('zoom' | 'export' | 'delete' | 'custom')[] = $state([]);
    /** Target side for pinning. */
    pinSide: 'left' | 'right' | 'top' | 'bottom' | 'none' = $state('none');
    doubleClickBehavior: 'maximize' | 'pin' = $state('maximize');
    /** Dynamic custom controls (e.g., Period Selectors in Charts). */
    headerControls = $state<any[]>([]);

    // --- VISUAL REFINEMENTS ---
    enableGlassmorphism = $state(true);
    enableBurningBorders = $state(true);
    opacity = $state(1.0);
    /** Close when clicking anywhere else in the app. */
    closeOnBlur = $state(false);
    /** Specifically for financial windows (Asset price). */
    showPriceInTitle = $state(false);
    currentPrice = $state("");

    // --- UTILITY/FEATURE STATE ---
    fontSize = $state(14);
    zoomLevel = $state(1.0);
    burnIntensity = $state(1.0);
    /** Fixed aspect ratio (width/height) to maintain during resizing. */
    aspectRatio: number | null = $state(null);
    /** Svelte Snippet for custom header content. */
    headerSnippet = $state<any>(null);
    minWidth = 200;
    minHeight = 150;

    /** Global counter to stagger new windows. */
    static staggerCount = 0;
    private resizeHandler: ((e: Event) => void) | null = null;
    /** Tracks if the current maximization was forced by responsive rules. */
    private _wasResponsiveMaximized = false;

    /**
     * Initializes the window instance.
     * Order of operations:
     * 1. Set type & title.
     * 2. Inherit defaults from WindowRegistry.
     * 3. Apply options.
     * 4. Restore state from LocalStorage (if persistent).
     * 5. Calculate final position (staggering vs cursor-vicinity).
     * 6. Setup responsive listeners.
     */
    constructor(options: WindowOptions = {}) {
        this.title = options.title || "";
        this.windowType = options.windowType || "window";

        // Apply Registry Defaults first
        const config = windowRegistry.getConfig(this.windowType);
        this.applyConfig(config);

        if (options.x !== undefined) this.x = options.x;
        if (options.y !== undefined) this.y = options.y;

        // Id stability logic
        if (options.id) {
            this.id = options.id;
        } else if (!this.allowMultipleInstances) {
            // Force fixed ID for singleton types
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

        // Position Logic: Only apply staggering/cursor-vicinity if NO valid saved state exists.
        if (typeof window !== 'undefined' && !this.hasRestoredPosition) {
            if (options.x !== undefined && options.y !== undefined) {
                // If opened via mouse click (e.g. from MarketOverview), position near cursor.
                // Clamping avoids windows spawning partially outside viewport.
                this.x = Math.max(10, Math.min(window.innerWidth - this.width - 10, options.x - 20));
                this.y = Math.max(10, Math.min(window.innerHeight - this.height - 10, options.y - 20));
            } else if (options.x === undefined && options.y === undefined) {
                // Standard staggering for new windows
                const stagger = this.centerByDefault ? 0 : (WindowBase.staggerCount % 10) * 20;
                this.x = (window.innerWidth - this.width) / 2 + stagger;
                this.y = (window.innerHeight - this.height) / 2 + stagger;

                if (!this.centerByDefault) {
                    WindowBase.staggerCount++;
                }
            }
        }

        // Setup Responsive maximization for mobile
        this.updateResponsiveState();
        if (typeof window !== 'undefined') {
            this.resizeHandler = () => this.updateResponsiveState();
            window.addEventListener('resize', this.resizeHandler);
        }
    }

    /** Clean up global listeners. */
    destroy() {
        if (typeof window !== 'undefined' && this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
        }
    }

    /** Evaluation of mobile/responsive limits. */
    updateResponsiveState() {
        if (!this.isResponsive || typeof window === 'undefined') return;

        const isSmall = window.innerWidth < this.edgeToEdgeBreakpoint;

        if (isSmall && !this.isMaximized) {
            this.maximize();
            this._wasResponsiveMaximized = true;
        } else if (!isSmall && this.isMaximized && this._wasResponsiveMaximized) {
            this.restore();
            this._wasResponsiveMaximized = false;
        }
    }

    private hasRestoredPosition = false;

    private get storageKey() {
        return `cachy_win_${this.id}`;
    }

    /** Serialize reactive state to persistent storage. */
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
            zoomLevel: this.zoomLevel,
            showPriceInTitle: this.showPriceInTitle
        };
        localStorage.setItem(this.storageKey, JSON.stringify(state));
    }

    /** Rehydrate state from storage if available. */
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
                this.showPriceInTitle = state.showPriceInTitle ?? this.showPriceInTitle;
                if (state.x !== undefined || state.y !== undefined) {
                    this.hasRestoredPosition = true;
                }
            }
        } catch (e) {
            console.error("Failed to restore window state:", e);
        }
    }

    /** Mapping of registry config to internal state. */
    private applyConfig(config: any) {
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
        this.isResponsive = f.isResponsive ?? false;
        this.edgeToEdgeBreakpoint = f.edgeToEdgeBreakpoint ?? 768;

        this.showIcon = f.showIcon ?? true;
        this.hasContextMenu = f.hasContextMenu ?? false;
        this.doubleClickAction = f.doubleClickAction ?? 'maximize';
        this.maxInstances = f.maxInstances ?? 0;
        this.closeOnBlur = f.closeOnBlur ?? f.closeOnOutsideClick ?? this.closeOnBlur;
        this.autoScaling = f.autoScaling ?? false;
        this.showRightScale = f.showRightScale ?? false;

        this.headerAction = f.headerAction ?? 'none';
        this.headerButtons = f.headerButtons ?? [];
        this.pinSide = f.pinSide ?? 'none';
        this.doubleClickBehavior = f.doubleClickBehavior ?? 'maximize';

        const l = config.layout;
        this.width = l.width ?? 640;
        this.height = l.height ?? 480;
        this.minWidth = l.minWidth ?? 200;
        this.minHeight = l.minHeight ?? 150;
        this.aspectRatio = l.aspectRatio ?? null;

        if (config.opacity !== undefined) this.opacity = config.opacity;
        if (config.defaultTitle && !this.title) this.title = config.defaultTitle;
    }

    /** Must be implemented by subclasses to specify the Svelte component used as content. */
    abstract get component(): any;

    /** Hook for subclasses to pass additional props to the internal component. */
    get componentProps(): Record<string, any> {
        return {};
    }

    /** Marks the window as focused. Visuals are handled by WindowFrame. */
    focus() {
        this.isFocused = true;
    }

    /**
     * Updates window coordinates with viewport confinement.
     * Prevents window from being moved entirely off-screen.
     */
    updatePosition(x: number, y: number) {
        if (this.isMaximized) return;

        if (typeof window !== 'undefined') {
            const screenWidth = window.innerWidth;
            // Ensure at least 38% of the window stays within the horizontal viewport
            const minVisible = this.width * 0.38;
            const minX = -(this.width - minVisible);
            const maxX = screenWidth - minVisible;

            this.x = Math.max(minX, Math.min(maxX, x));

            // Vertical constraint: Header must always stay accessible (y >= 0)
            const screenHeight = window.innerHeight;
            const minVisibleY = this.height * 0.38;
            const maxY = screenHeight - minVisibleY;

            this.y = Math.max(0, Math.min(maxY, y));
        } else {
            this.x = x;
            this.y = y;
        }
    }

    /** Updates window dimensions with support for fixed aspect ratios. */
    updateSize(width: number, height: number) {
        if (this.isMaximized) return;

        let newWidth = Math.max(width, this.minWidth);
        let newHeight = Math.max(height, this.minHeight);

        if (this.aspectRatio) {
            // Header height is 41px according to WindowFrame layout.
            // Aspect ratio only applies to the CONTENT area.
            const HEADER_HEIGHT = 41;
            newHeight = Math.round((newWidth / this.aspectRatio) + HEADER_HEIGHT);
        }

        this.width = Math.round(newWidth);
        this.height = Math.round(newHeight);
    }

    /** Toggles maximization state. */
    toggleMaximize() {
        if (!this.allowMaximize) return;

        if (this.isMaximized) {
            this.restore();
        } else {
            this.maximize();
        }
    }

    /** Full maximization (fills viewport). Stores floating state first. */
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

    /**
     * Restores the window from minimized or maximized state.
     * If minimized, it simply returns to its previous floating/maximized state.
     */
    restore() {
        if (this.isMinimized) {
            this.isMinimized = false;
            return;
        }
        if (this.isMaximized) {
            this.x = this.lastX;
            this.y = this.lastY;
            this.width = this.lastWidth;
            this.height = this.lastHeight;
            this.isMaximized = false;
        }
    }

    /** Minimizes window to the docking bar. Content visibility is handled via CSS. */
    minimize() {
        if (!this.allowMinimize) return;
        this.isMinimized = true;
        this.isFocused = false;
    }

    /** Pinning logic (experimental tiling). */
    togglePin() {
        if (this.pinSide === 'none') return;
        this.isPinned = !this.isPinned;
        if (this.isPinned) {
            this.isMaximized = false;
        }
    }

    // --- INTERACTION HOOKS (TO BE OVERRIDDEN BY SUBCLASSES) ---
    /** Triggered when the title text is clicked (if headerAction is 'toggle-mode'). */
    onHeaderTitleClick() { }
    /** Triggered by the export button in the header. */
    onHeaderExport() { }
    /** Triggered by the delete/trash button in the header. */
    onHeaderDelete() { }
    /** Triggered by the custom action button in the header. */
    onHeaderCustomAction() { }

    /**
     * Returns a list of actions for the right-click settings menu.
     * Subclasses should call super.getContextMenuActions() and merge their own.
     */
    public getContextMenuActions(): any[] {
        const actions: any[] = [];

        // Base "Smash" (Close) action.
        actions.push({
            label: "Smash",
            icon: "🔨",
            danger: true,
            action: () => {
                // Actual closing is triggered by WindowFrame calling WindowManager.close
            }
        });

        return actions;
    }

    /** Requests the content to perform an auto-scaling operation (e.g. Fit to screen). */
    autoScale() { }

    // --- CORE FEATURE METHODS ---
    /** Increases content zoom by 10%. Max 200%. */
    zoomIn() { if (this.allowZoom) this.zoomLevel = Math.min(this.zoomLevel + 0.1, 2.0); }
    /** Decreases content zoom by 10%. Min 50%. */
    zoomOut() { if (this.allowZoom) this.zoomLevel = Math.max(this.zoomLevel - 0.1, 0.5); }
    resetZoom() { if (this.allowZoom) this.zoomLevel = 1.0; }

    /** Sets font size in pixels (Range: 8 - 32). */
    setFontSize(size: number) { if (this.allowFontSize) this.fontSize = Math.min(Math.max(size, 8), 32); }
}
