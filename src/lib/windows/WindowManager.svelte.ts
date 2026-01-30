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
        const existing = this._windows.find(w => w.id === windowInstance.id);
        if (!existing) {
            this._windows.push(windowInstance);
        }
        this.bringToFront(windowInstance.id);
    }

    close(id: string) {
        this._windows = this._windows.filter(w => w.id !== id);
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
                // If we clicked something that is NOT part of a window,
                // close all windows with closeOnBlur = true
                const target = e.target as HTMLElement;
                if (!target.closest('.window-frame')) {
                    this.handleBackgroundClick();
                }
            });
        }
    }

    // Call this when clicking the background/layout
    handleBackgroundClick() {
        this._windows.filter(w => w.closeOnBlur).forEach(w => this.close(w.id));
    }
}

export const windowManager = new WindowManager();
