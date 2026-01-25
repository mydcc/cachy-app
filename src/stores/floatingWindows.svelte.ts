/*
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.
*/

export interface FloatingWindow {
    id: string;
    url: string;
    title: string;
    width: number;
    height: number;
    x: number;
    y: number;
    zIndex: number;
}

class FloatingWindowsStore {
    private windows = $state<FloatingWindow[]>([]);
    private nextZIndex = $state(1000);
    private maxWindows = 3;

    get all(): FloatingWindow[] {
        return this.windows;
    }

    openWindow(url: string, title: string): void {
        // Prüfe ob Window mit dieser URL bereits existiert
        const existing = this.windows.find((w) => w.url === url);
        if (existing) {
            this.focusWindow(existing.id);
            return;
        }

        // Wenn Limit erreicht, schließe ältestes Fenster
        if (this.windows.length >= this.maxWindows) {
            const oldest = this.windows.reduce((prev, curr) =>
                prev.zIndex < curr.zIndex ? prev : curr,
            );
            this.closeWindow(oldest.id);
        }

        // Berechne Position (gestaffelt)
        const offset = this.windows.length * 40;
        const centerX = window.innerWidth / 2 - 512; // 1024px / 2
        const centerY = window.innerHeight / 2 - 288; // 576px / 2

        const newWindow: FloatingWindow = {
            id: crypto.randomUUID(),
            url,
            title,
            width: 1024,
            height: 576, // 16:9 Verhältnis
            x: Math.max(0, centerX + offset),
            y: Math.max(0, centerY + offset),
            zIndex: this.nextZIndex++,
        };

        this.windows.push(newWindow);
        console.log('FloatingWindow opened:', { id: newWindow.id, url, title });
    }

    closeWindow(id: string): void {
        const index = this.windows.findIndex((w) => w.id === id);
        if (index !== -1) {
            console.log('FloatingWindow closed:', { id });
            this.windows.splice(index, 1);
        }
    }

    focusWindow(id: string): void {
        const window = this.windows.find((w) => w.id === id);
        if (window) {
            window.zIndex = this.nextZIndex++;
            console.log('FloatingWindow focused:', { id, zIndex: window.zIndex });
        }
    }

    updatePosition(id: string, x: number, y: number): void {
        const window = this.windows.find((w) => w.id === id);
        if (window) {
            window.x = x;
            window.y = y;
        }
    }

    updateSize(id: string, width: number, height: number): void {
        const window = this.windows.find((w) => w.id === id);
        if (window) {
            window.width = width;
            window.height = height;
        }
    }
}

export const floatingWindowsStore = new FloatingWindowsStore();
