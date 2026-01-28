/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { fireStore } from "../stores/fireStore.svelte";
import { settingsState } from "../stores/settings.svelte";

let idCounter = 0;

export interface BurnOptions {
    intensity?: number;
    color?: string;
    id?: string;
}

export function burn(node: HTMLElement, options: BurnOptions | undefined) {
    const id = options?.id || `burn-${idCounter++}`;
    let lastRect: DOMRect | null = null;

    // Set data attribute for debugging/styling
    node.setAttribute("data-burn-id", id);
    if (import.meta.env.DEV) {
        console.log(`[Burn Action] Init ${id}`, options);
    }

    const update = () => {
        // If burning borders globally disabled OR specific options are missing, remove from store
        if (!settingsState.enableBurningBorders || !options) {
            fireStore.removeElement(id);
            lastRect = null;
            return;
        }

        const rect = node.getBoundingClientRect();

        // Only update store if something changed to save performance
        // BUT if it was previously removed (lastRect null), force update
        if (lastRect &&
            rect.top === lastRect.top &&
            rect.left === lastRect.left &&
            rect.width === lastRect.width &&
            rect.height === lastRect.height &&
            settingsState.enableBurningBorders // Ensure we double check enablement
        ) {
            return;
        }

        // Fix zero size issues - if hidden, remove from store
        if (rect.width === 0 || rect.height === 0) {
            fireStore.removeElement(id);
            lastRect = null;
            return;
        }

        // Resolve Color based on Mode
        let finalColor = options.color ?? "#ffaa00";
        if (settingsState.borderEffectColorMode === "theme") {
            const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim();
            finalColor = accent || "#ff8800";
        } else if (settingsState.borderEffectColorMode === "custom") {
            finalColor = settingsState.borderEffectCustomColor;
        }

        fireStore.updateElement(id, {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
            intensity: options.intensity ?? 1.0,
            color: finalColor
        });
        lastRect = rect;
    };

    // Use ResizeObserver for efficient updates when size changes
    const resizeObserver = new ResizeObserver(() => update());
    resizeObserver.observe(node);

    // Tracking loop for movement (scroll/drag)
    let frameId: number;
    const loop = () => {
        if (settingsState.enableBurningBorders && options) {
            update();
        }
        frameId = requestAnimationFrame(loop);
    };

    // Initial update and start tracking loop
    update();
    loop();

    return {
        update(newOptions: BurnOptions | undefined) {
            options = newOptions;
            if (import.meta.env.DEV) {
                console.log(`[Burn Action] Update ${id}`, options);
            }
            update();
        },
        destroy() {
            if (import.meta.env.DEV) {
                console.log(`[Burn Action] Destroy ${id}`);
            }
            resizeObserver.disconnect();
            cancelAnimationFrame(frameId);
            fireStore.removeElement(id);
            node.removeAttribute("data-burn-id");
        }
    };
}
