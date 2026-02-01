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

/**
 * WindowManager is a singleton class that manages the lifecycle, stacking order,
 * and visibility of all windows in the application.
 * 
 * Key Features:
 * - Singleton pattern: only one instance exists (`windowManager`).
 * - Stacking: manages `zIndex` to ensure the focused window is always on top.
 * - Instance Control: enforces limits on multiple instances and global window counts.
 * - Interaction: handles background clicks to release focus or close "blur-to-close" windows.
 */
class WindowManager {
    /** Reactive list of all currently open window instances. */
    private _windows = $state<WindowBase[]>([]);
    /** Internal counter for global stacking order. Incremented on every focus event. */
    private _nextZIndex = 11000;

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
            if (existing.isMinimized) {
                // If minimized, restore it instead of closing.
                // This fix ensures that windows restored from cache at startup
                // are first expanded before being toggle-closed.
                existing.restore();
                this.bringToFront(id);
            } else {
                // If already open and active, close it.
                this.close(id);
            }
        } else {
            // Not open yet, instantiate and register.
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
     * Global Mouse Listener initialization.
     * Detects clicks on the "background" to deselect/close windows.
     */
    constructor() {
        if (typeof window !== 'undefined') {
            window.addEventListener('mousedown', (e) => {
                const target = e.target as HTMLElement;

                // Ignore clicks originating inside any window.
                if (target.closest('.window-frame')) return;

                // Ignore clicks on main UI components (identified by .glass-panel).
                if (target.closest('.glass-panel')) return;

                // If we reach here, the click happened in the "empty space" behind the UI.
                this.handleBackgroundClick();
            });
        }
    }

    /** Evaluates and closes all windows marked for destruction on background clicks. */
    handleBackgroundClick() {
        this._windows.filter(w => w.closeOnBlur).forEach(w => this.close(w.id));
    }
}

export const windowManager = new WindowManager();
