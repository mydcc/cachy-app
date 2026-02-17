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
  Singleton Window Manager for Reactive UI Stacking
*/

import type { WindowBase } from "./WindowBase.svelte";
import { ModalWindow } from "./implementations/ModalWindow.svelte";
import { IframeWindow } from "./implementations/IframeWindow.svelte";
// ChartWindow and ChannelWindow are imported dynamically in createFromData 
// to avoid circular dependencies during initialization.

const BASE_Z_INDEX = 11000;
const MAX_SAFE_Z_INDEX = 1000000;
const SAVE_DEBOUNCE_MS = 500;

/**
 * WindowManager is a singleton class that manages the lifecycle, stacking order,
 * and visibility of all windows in the application.
 */
class WindowManager {
    /** Reactive list of all currently open window instances. */
    private _windows = $state<WindowBase[]>([]);
    /** Internal counter for global stacking order. Incremented on every focus event. */
    private _nextZIndex = BASE_Z_INDEX;
    /** Timer for debounced session saving. */
    private _saveSessionTimer: ReturnType<typeof setTimeout> | null = null;

    constructor() {
        // Automatic rehydration from session storage if available
        if (typeof window !== 'undefined') {
            setTimeout(() => this.rehydrate(), 100);

            // Global Mouse Listener: Detects clicks on the "background" to deselect/close windows.
            window.addEventListener('mousedown', (e) => {
                const target = e.target as HTMLElement;

                // Ignore clicks originating inside any window.
                if (target.closest('.window-frame')) return;

                // Ignore clicks on main UI components (identified by .glass-panel).
                if (target.closest('.glass-panel')) return;

                // If we reach here, the click happened in the "empty space" behind the UI.
                this.handleBackgroundClick();
            });

            window.addEventListener('beforeunload', () => {
                if (this._saveSessionTimer) {
                    clearTimeout(this._saveSessionTimer);
                    this._performSaveSession();
                }
            });
        }
    }

    /**
     * Persists the current list of open windows to session storage.
     * Debounced to prevent race conditions and excessive writes.
     */
    private saveSession() {
        if (typeof sessionStorage === 'undefined') return;

        if (this._saveSessionTimer) {
            clearTimeout(this._saveSessionTimer);
        }

        this._saveSessionTimer = setTimeout(() => {
            this._performSaveSession();
            this._saveSessionTimer = null;
        }, SAVE_DEBOUNCE_MS);
    }

    /**
     * Internal method to execute the session save logic.
     */
    private _performSaveSession() {
        try {
            const openWindows = this._windows
                .filter(w => w.windowType !== 'dialog') // Don't persist temporary alerts
                .map(w => w.serialize());
            sessionStorage.setItem('cachy_open_windows', JSON.stringify(openWindows));
        } catch (e) {
            console.error("Failed to save window session:", e);
        }
    }

    /**
     * Attempts to recreate windows from the last browser session (tab reload).
     */
    private async rehydrate() {
        if (typeof sessionStorage === 'undefined') return;
        try {
            const saved = sessionStorage.getItem('cachy_open_windows');
            if (saved) {
                let data: any[];
                try {
                    data = JSON.parse(saved);
                } catch (parseError) {
                    console.error("Corrupt session data found. Clearing session storage.", parseError);
                    sessionStorage.removeItem('cachy_open_windows');
                    if (typeof window !== 'undefined' && window.alert) {
                        window.alert("Window session could not be restored due to data corruption. Resetting layout.");
                    }
                    return;
                }

                if (!Array.isArray(data)) {
                    console.warn("Invalid session data format (not an array). Clearing session.");
                    sessionStorage.removeItem('cachy_open_windows');
                    return;
                }

                const validInstances: WindowBase[] = [];

                // Process each window item individually to prevent total failure
                for (const item of data) {
                    try {
                        const instance = await this.createFromData(item);
                        if (instance) {
                            validInstances.push(instance);
                        } else {
                            console.warn("Failed to recreate window from data (null result):", item);
                        }
                    } catch (itemError) {
                        console.error("Error rehydrating specific window:", item, itemError);
                        // Continue with other windows (fail-safe)
                    }
                }

                // Open all successfully created instances
                for (const instance of validInstances) {
                    this.open(instance);
                }
            }
        } catch (e) {
            console.error("Critical failure during window rehydration:", e);
        }
    }

    /**
     * Factory method to create window instances from serialized data.
     */
    private async createFromData(data: any): Promise<WindowBase | null> {
        if (!data || !data.type) return null;

        switch (data.type) {
            case 'chart':
                const { ChartWindow } = await import("./implementations/ChartWindow.svelte");
                return new ChartWindow(data.symbol || "BTCUSDT", { timeframe: data.timeframe });
            case 'iframe':
                // Check if it's a channel window or a generic iframe
                if (data.id && (data.id.startsWith('channel') || data.id.startsWith('market'))) {
                    const { ChannelWindow } = await import("./implementations/ChannelWindow.svelte");
                    return new ChannelWindow(data.url, data.title, data.id);
                }
                return new IframeWindow(data.url, data.title);
            default:
                return null;
        }
    }

    /** Returns the current list of managed windows. */
    get windows() {
        return this._windows;
    }

    /**
     * Registers and opens a new window instance.
     * @param windowInstance The WindowBase derivative to open.
     */
    open(windowInstance: WindowBase) {
        // 1. Singleton Check: Prevent duplicate opening of the exact same instance by ID.
        const existingById = this._windows.find(w => w.id === windowInstance.id);
        if (existingById) {
            this.bringToFront(existingById.id);
            return;
        }

        // 2. Type-based Singleton Control: Ensure single-instance windows don't duplicate.
        if (!windowInstance.allowMultipleInstances) {
            const existingByType = this._windows.find(
                w => w.windowType === windowInstance.windowType
            );
            if (existingByType) {
                this.bringToFront(existingByType.id);
                return;
            }
        }

        // 3. Global Capacity Management: Prevent excessive memory/DOM usage.
        // Dialogs/Modals are excluded from this limit.
        const activeWindows = this._windows.filter(w => w.windowType !== 'dialog');
        if (activeWindows.length >= 20) {
            // FIFO strategy: Close the oldest visible window to make room.
            const oldest = activeWindows[0];
            this.close(oldest.id);
        }

        // 4. Registration and activation.
        this._windows.push(windowInstance);
        this.bringToFront(windowInstance.id);
        this.saveSession();
    }

    /**
     * Removes a window from the management pool and triggers its destruction.
     * @param id The unique ID of the window to close.
     */
    close(id: string) {
        const win = this._windows.find(w => w.id === id);
        if (win) {
            if (typeof win.destroy === 'function') {
                win.destroy();
            }
            this._windows = this._windows.filter(w => w.id !== id);
            this.saveSession();
        }
    }

    /**
     * Toggles a window's open state by ID.
     * 
     * Enhanced UX: If the window is currently minimized, the first toggle 
     * click will RESTORE it to the front instead of closing it.
     * 
     * @param id Unique identifier.
     * @param createFn Closure to instantiate the window if it's currently closed.
     */
    toggle(id: string, createFn: () => WindowBase) {
        const existing = this._windows.find(w => w.id === id);

        if (existing) {
            // As requested: Close the window regardless of whether it is minimized or open.
            this.close(id);
        } else {
            // Not open yet, instantiate and register.
            // windowInstance will restore its persistence state (e.g. isMinimized) in constructor.
            this.open(createFn());
        }
    }

    /** Checks if a window with the given ID is currently active. */
    isOpen(id: string) {
        return this._windows.some(w => w.id === id);
    }

    /** Utility for quick modal creation. */
    openModal(component: any, title: string, options: any = {}) {
        this.open(new ModalWindow(component, title, options));
    }

    /** Utility for external content integration. */
    openIframe(url: string, title: string, options: any = {}) {
        this.open(new IframeWindow(url, title, options));
    }

    /** Calculates the relative position of a minimized window within the docking bar. */
    getMinimizedIndex(id: string): number {
        return this._windows
            .filter(w => w.isMinimized)
            .findIndex(w => w.id === id);
    }

    /**
     * Updates stacking order and focus state.
     * Brings the specified window to the visual front.
     */
    bringToFront(id: string) {
        const win = this._windows.find(w => w.id === id);
        if (win) {
            // Normalize Z-Indices if we are approaching the safe integer limit
            // or a reasonably high number to prevent overflow over long sessions.
            if (this._nextZIndex > MAX_SAFE_Z_INDEX) {
                this.normalizeZIndices();
            }

            win.zIndex = this._nextZIndex++;

            // Handle focus synchronization.
            this._windows.forEach(w => {
                if (w.id !== id && w.closeOnBlur) {
                    // Automatically close "transient" windows (e.g. Symbol Selector)
                    // if another window takes focus.
                    this.close(w.id);
                } else {
                    w.isFocused = (w.id === id);
                }
            });
        }
    }

    /**
     * Resets Z-Indices for all windows to prevent overflow, preserving relative order.
     */
    private normalizeZIndices() {
        // Sort windows by their current Z-Index
        const sorted = [...this._windows].sort((a, b) => a.zIndex - b.zIndex);

        // Reset base counter
        this._nextZIndex = BASE_Z_INDEX;

        // Reassign new sequential Z-Indices
        for (const win of sorted) {
            win.zIndex = this._nextZIndex++;
        }
    }


    /** Evaluates and closes all windows marked for destruction on background clicks. */
    handleBackgroundClick() {
        this._windows.filter(w => w.closeOnBlur).forEach(w => this.close(w.id));
    }
}

export const windowManager = new WindowManager();
