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

class WindowManager {
    private _windows = $state<WindowBase[]>([]);
    private _nextZIndex = 11000;

    get windows() {
        return this._windows;
    }

    open(windowInstance: WindowBase) {
        // 1. Check if EXACT window instance already exists by ID
        const existingById = this._windows.find(w => w.id === windowInstance.id);
        if (existingById) {
            this.bringToFront(existingById.id);
            return;
        }

        // 2. Check if a window of the SAME TYPE already exists (if multiple instances are NOT allowed)
        if (!windowInstance.allowMultipleInstances) {
            const existingByType = this._windows.find(
                w => w.windowType === windowInstance.windowType
            );
            if (existingByType) {
                this.bringToFront(existingByType.id);
                return;
            }
        }

        // 3. Global Limit Check: Max 2 Windows
        // Toasts and Dialogs could be exempt, but for now we follow the "max 2" strictly for windows
        const activeWindows = this._windows.filter(w => w.windowType !== 'dialog');
        if (activeWindows.length >= 2) {
            // Close the oldest visible window (first in list)
            const oldest = activeWindows[0];
            this.close(oldest.id);
        }

        // 4. Otherwise add new window
        this._windows.push(windowInstance);
        this.bringToFront(windowInstance.id);
    }

    close(id: string) {
        const win = this._windows.find(w => w.id === id);
        if (win) {
            if (typeof win.destroy === 'function') {
                win.destroy();
            }
            this._windows = this._windows.filter(w => w.id !== id);
        }
    }

    toggle(id: string, createFn: () => WindowBase) {
        if (this.isOpen(id)) {
            this.close(id);
        } else {
            this.open(createFn());
        }
    }

    isOpen(id: string) {
        return this._windows.some(w => w.id === id);
    }

    openModal(component: any, title: string, options: any = {}) {
        this.open(new ModalWindow(component, title, options));
    }

    openIframe(url: string, title: string, options: any = {}) {
        this.open(new IframeWindow(url, title, options));
    }

    bringToFront(id: string) {
        const win = this._windows.find(w => w.id === id);
        if (win) {
            win.zIndex = this._nextZIndex++;

            // Close other windows that have closeOnBlur set to true
            this._windows.forEach(w => {
                if (w.id !== id && w.closeOnBlur) {
                    this.close(w.id);
                } else {
                    w.isFocused = (w.id === id);
                }
            });
        }
    }

    constructor() {
        if (typeof window !== 'undefined') {
            window.addEventListener('mousedown', (e) => {
                const target = e.target as HTMLElement;

                // 1. If we clicked inside a window, ignore.
                if (target.closest('.window-frame')) return;

                // 2. If we clicked on ANY UI component (calculator, tiles, sidebars), 
                // we keep the windows open. All major UI components in Cachy use '.glass-panel'.
                if (target.closest('.glass-panel')) return;

                // 3. Otherwise, it's a "background click" (the void), so close windows.
                this.handleBackgroundClick();
            });
        }
    }

    // Call this when clicking the background/layout
    handleBackgroundClick() {
        this._windows.filter(w => w.closeOnBlur).forEach(w => this.close(w.id));
    }
}

export const windowManager = new WindowManager();
