/*
  Copyright (C) 2026 MYDCT
  Singleton Window Manager for Reactive UI Stacking
*/

import type { WindowBase } from "./WindowBase.svelte";

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

    bringToFront(id: string) {
        const win = this._windows.find(w => w.id === id);
        if (win) {
            win.zIndex = this._nextZIndex++;
            this._windows.forEach(w => w.isFocused = (w.id === id));
        }
    }
}

export const windowManager = new WindowManager();
