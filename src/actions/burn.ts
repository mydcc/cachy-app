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
import { untrack } from "svelte";
import { marketState } from "../stores/market.svelte";
import { tradeState } from "../stores/trade.svelte";
import { normalizeSymbol } from "../utils/symbolUtils";
import { readCssColor, getThemePalette, invalidateThemePalette } from "../lib/themeColors";
import type { Decimal } from "decimal.js";

let idCounter = 0;

// Geometry shape shared between the pushed-coordinates fast path and the
// node.getBoundingClientRect() fallback (a DOMRect structurally satisfies this).
interface Rect {
    top: number;
    left: number;
    width: number;
    height: number;
}

export interface BurnOptions {
    color?: string; // CSS variable or hex
    intensity?: number;
    layer?: 'tiles' | 'windows' | 'modals';
    id?: string;
    mode?: 'theme' | 'interactive' | 'custom' | 'classic' | 'glow';
    symbol?: string; // Specific symbol to track for price trends
    // Optional Geometry Push (avoid getBoundingClientRect)
    x?: number;
    y?: number;
    width?: number;
    height?: number;
}


// The semantic palette is cached in `lib/themeColors.ts`; a theme class change
// drops that cache so the next resolve re-reads the CSS variables.
const themeObserver = typeof document !== 'undefined'
    ? new MutationObserver(() => invalidateThemePalette())
    : null;

if (themeObserver && typeof document !== 'undefined') {
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
}

export function resetBurnThemeCache() {
    invalidateThemePalette();
}

class BurnColorResolver {
    private localLastSymbol = "";
    private localLastPrice: Decimal | null = null;
    private localTrendColor = ""; // Persists until change

    resolve(inputColor?: string, localMode?: string, inputSymbol?: string): string {
        const mode = localMode || settingsState.borderEffectColorMode;

        if (mode === "theme") {
            return getThemePalette().accent;
        }

        if (mode === "custom") {
            return settingsState.borderEffectCustomColor;
        }

        if (mode === "classic") {
            // The shader owns the classic fire core; the value is only a sentinel.
            return "#ff8800";
        }

        // Interactive Mode Logic
        if (mode === "interactive") {
            // 1. Explicit color override (e.g. FlashCard Back)
            if (inputColor) {
                if (inputColor.startsWith('var(')) {
                    const varName = inputColor.match(/var\(\s*(--[\w-]+)/)?.[1];
                    if (varName) {
                        return readCssColor(varName, getThemePalette().accent);
                    }
                }
                return inputColor;
            }

            // 2. Automatic Price Trend (Like Market Tiles Border)
            const symbol = inputSymbol || tradeState.symbol;
            if (symbol) {
                // marketState.data is always keyed by the canonical
                // (Bitunix-style) symbol regardless of active provider
                // (see MarketOverview.svelte).
                const key = normalizeSymbol(symbol, "bitunix");
                const data = marketState.data[key];

                if (data && data.lastPrice) {
                    // Check for Symbol Change -> Reset Trend
                    if (symbol !== this.localLastSymbol) {
                        this.localLastSymbol = symbol;
                        this.localLastPrice = data.lastPrice;
                        this.localTrendColor = ""; // Reset to neutral/accent
                    }
                    // Check for Price Change -> Update Trend
                    else if (this.localLastPrice && !data.lastPrice.equals(this.localLastPrice)) {
                        const palette = getThemePalette();
                        this.localTrendColor = data.lastPrice.gt(this.localLastPrice)
                            ? palette.success
                            : palette.danger;
                        this.localLastPrice = data.lastPrice;
                    }
                }

                // Return Trend Color if established, otherwise Accent (Idle/Init)
                return this.localTrendColor || getThemePalette().accent;
            }

            return getThemePalette().accent; // Fallback to accent
        }

        return inputColor ?? "#ffaa00";
    }
}

export function burn(node: HTMLElement, options: BurnOptions | undefined) {
    const colorResolver = new BurnColorResolver();
    let currentOptions = options;
    let id = currentOptions?.id || `burn-${idCounter++}`;
    let lastRect: Rect | null = null;

    // Set data attribute for debugging/styling
    node.setAttribute("data-burn-id", id);
    if (import.meta.env.DEV && options) {
        // console.log(`[Burn Action] Init ${id}`, options);
    }

    // Track style state to avoid redundant store updates
    let lastFinalColor = "";
    let lastIntensity = 1.0;
    let lastMode = "";
    let lastLayer = "";
    let lastSymbol = "";



    const update = (force = false) => {
        untrack(() => {
            if (!settingsState.enableBurningBorders || !currentOptions) {
                fireStore.removeElement(id);
                lastRect = null;
                return;
            }

            // 1. Geometry resolution: Use Push (options) or Pull (getBoundingClientRect)
            let rect: Rect;
            const isPushActive = currentOptions.width !== undefined && currentOptions.height !== undefined;

            if (isPushActive) {
                // GAMING STANDARD: Use values pushed from Svelte (Zero Layout Cost)
                rect = {
                    top: currentOptions.y ?? 0,
                    left: currentOptions.x ?? 0,
                    width: currentOptions.width ?? 0,
                    height: currentOptions.height ?? 0
                };
            } else {
                // FALLBACK: Traditional measurement (Legacy or non-window elements)
                rect = node.getBoundingClientRect();
            }

            // 1. Position Update Guard with integer tolerance
            // Using 1.0 instead of 0.1 to prevent sub-pixel layout loops
            const posChanged = !lastRect ||
                Math.abs(rect.top - lastRect.top) >= 1.0 ||
                Math.abs(rect.left - lastRect.left) >= 1.0 ||
                Math.abs(rect.width - lastRect.width) >= 1.0 ||
                Math.abs(rect.height - lastRect.height) >= 1.0;

            // 2. Style Update (Normalized comparison)
            const finalColor = colorResolver.resolve(currentOptions.color, currentOptions.mode, currentOptions.symbol).toLowerCase();
            const intensity = currentOptions.intensity ?? 1.0;
            const currentMode = settingsState.borderEffectColorMode;
            const currentLayer = currentOptions.layer ?? "tiles";
            const explicitMode = currentOptions.mode;
            const currentSymbol = currentOptions.symbol ?? "";

            const styleChanged = finalColor !== lastFinalColor.toLowerCase() ||
                intensity !== lastIntensity ||
                currentMode !== lastMode ||
                currentLayer !== lastLayer ||
                currentSymbol !== lastSymbol;

            // 3. Size Guard
            if (rect.width === 0 || rect.height === 0) {
                if (lastRect) fireStore.removeElement(id);
                lastRect = null;
                return;
            }

            // 4. Update
            if (posChanged || styleChanged || force) {
                fireStore.updateElement(id, {
                    x: Math.round(rect.left),
                    y: Math.round(rect.top),
                    width: Math.round(rect.width),
                    height: Math.round(rect.height),
                    intensity: intensity,
                    color: finalColor,
                    layer: currentLayer,
                    mode: explicitMode || currentMode
                });

                lastRect = rect;
                lastFinalColor = finalColor;
                lastIntensity = intensity;
                lastMode = currentMode;
                lastLayer = currentLayer;
                lastSymbol = currentSymbol;
            }
        });
    };

    // Use ResizeObserver for efficient updates when size changes
    let resizeFrame: number;
    const resizeObserver = new ResizeObserver(() => {
        // If we have pushed geometry, we don't need the observer to trigger updates
        if (currentOptions && currentOptions.width !== undefined) return;

        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => update());
    });
    resizeObserver.observe(node);

    // GAMING STANDARD: Occlusion Culling & Loop Management
    let isVisible = false;
    const visibilityObserver = new IntersectionObserver((entries) => {
        isVisible = entries[0].isIntersecting;
    });
    visibilityObserver.observe(node);

    let loopFrame: number;
    const loop = () => {
        // Only poll if visible AND no coordinates are pushed (e.g. Market Tiles)
        if (isVisible && settingsState.enableBurningBorders && currentOptions) {
            const isPushActive = currentOptions.width !== undefined && currentOptions.height !== undefined;
            if (!isPushActive) {
                update();
            }
        }
        loopFrame = requestAnimationFrame(loop);
    };

    // Initial start
    requestAnimationFrame(() => {
        update(true);
        loop();
    });

    return {
        update(newOptions: BurnOptions | undefined) {
            const oldId = id;
            currentOptions = newOptions;

            // Update ID if explicitly provided and different
            if (currentOptions?.id && currentOptions.id !== id) {
                id = currentOptions.id;
                fireStore.removeElement(oldId);
            }

            resetBurnThemeCache(); // Reset cache on explicit option change
            requestAnimationFrame(() => update(true));
        },
        destroy() {
            resizeObserver.disconnect();
            visibilityObserver.disconnect();
            cancelAnimationFrame(resizeFrame);
            cancelAnimationFrame(loopFrame);
            fireStore.removeElement(id);
            node.removeAttribute("data-burn-id");
        }
    };
}
