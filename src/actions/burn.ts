import { fireStore } from "../stores/fireStore.svelte";
import { settingsState } from "../stores/settings.svelte";
import { untrack } from "svelte";
import { marketState } from "../stores/market.svelte";
import { tradeState } from "../stores/trade.svelte";
import { normalizeSymbol } from "../utils/symbolUtils";

let idCounter = 0;

export interface BurnOptions {
    color?: string; // CSS variable or hex
    intensity?: number;
    layer?: 'tiles' | 'windows' | 'modals';
    id?: string;
    mode?: 'theme' | 'interactive' | 'custom' | 'classic' | 'glow';
}

export function burn(node: HTMLElement, options: BurnOptions | undefined) {
    const id = options?.id || `burn-${idCounter++}`;
    let lastRect: DOMRect | null = null;

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
    let cachedThemeColor = "";
    let lastThemeCheck = 0;
    let cachedUpColor = "";
    let cachedDownColor = "";
    // Global trend state for Interactive Mode (shared across all instances)
    let globalLastSymbol = "";
    let globalLastPrice: any = null; // Decimal
    let globalTrendColor = ""; // Persists until change

    /**
     * Resolves the final color based on settings and options.
     * Logic is optimized to avoid repetitive getComputedStyle calls.
     */
    const resolveColor = (inputColor?: string, localMode?: string): string => {
        const mode = localMode || settingsState.borderEffectColorMode;

        // Common vars for theme color resolution
        const getaccent = () => {
            const now = Date.now();
            if (!cachedThemeColor || now - lastThemeCheck > 500) {
                cachedThemeColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || "#ff8800";
                lastThemeCheck = now;
            }
            return cachedThemeColor;
        };

        if (mode === "theme") {
            return getaccent();
        }

        // Reset cache when leaving theme mode (controlled mainly by getaccent check)

        if (mode === "custom") {
            return settingsState.borderEffectCustomColor;
        }

        if (mode === "classic") {
            return "#ff8800"; // Dummy
        }

        // Interactive Mode Logic
        if (mode === "interactive") {
            // 1. Explicit color override (e.g. FlashCard Back)
            if (inputColor) {
                if (inputColor.startsWith('var(')) {
                    const varName = inputColor.match(/var\(([^)]+)\)/)?.[1];
                    if (varName) {
                        return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || "#ff8800";
                    }
                }
                return inputColor;
            }

            // 2. Automatic Price Trend (Like Market Tiles Border)
            const symbol = tradeState.symbol;
            if (symbol) {
                const provider = settingsState.apiProvider;
                const key = normalizeSymbol(symbol, provider);
                const data = marketState.data[key];

                // Cache colors if needed
                if (!cachedUpColor || !cachedDownColor) {
                    const style = getComputedStyle(document.documentElement);
                    cachedUpColor = style.getPropertyValue('--success-color').trim() || "#00ff00";
                    cachedDownColor = style.getPropertyValue('--danger-color').trim() || "#ff0000";
                }

                if (data && data.lastPrice) {
                    // Check for Symbol Change -> Reset Trend
                    if (symbol !== globalLastSymbol) {
                        globalLastSymbol = symbol;
                        globalLastPrice = data.lastPrice;
                        globalTrendColor = ""; // Reset to neutral/accent
                    }
                    // Check for Price Change -> Update Trend
                    else if (globalLastPrice && !data.lastPrice.equals(globalLastPrice)) {
                        const isUp = data.lastPrice.gt(globalLastPrice);
                        globalTrendColor = isUp ? cachedUpColor : cachedDownColor;
                        globalLastPrice = data.lastPrice;
                    }
                }

                // Return Trend Color if established, otherwise Accent (Idle/Init)
                return globalTrendColor || getaccent();
            }

            return getaccent(); // Fallback to accent
        }

        return inputColor ?? "#ffaa00";
    };

    const update = (force = false) => {
        // Use untrack to prevent reading settingsState from registering a dependency 
        untrack(() => {
            if (!settingsState.enableBurningBorders || !options) {
                fireStore.removeElement(id);
                lastRect = null;
                return;
            }

            const rect = node.getBoundingClientRect();

            // 1. Position Update Guard with some tolerance
            const posChanged = !lastRect ||
                Math.abs(rect.top - lastRect.top) > 0.1 ||
                Math.abs(rect.left - lastRect.left) > 0.1 ||
                Math.abs(rect.width - lastRect.width) > 0.1 ||
                Math.abs(rect.height - lastRect.height) > 0.1;

            // 2. Style Update (Normalized comparison)
            const finalColor = resolveColor(options.color, options.mode).toLowerCase();
            const intensity = options.intensity ?? 1.0;
            const currentMode = settingsState.borderEffectColorMode;
            const currentLayer = options.layer ?? "tiles";
            const explicitMode = options.mode;

            const styleChanged = finalColor !== lastFinalColor.toLowerCase() ||
                intensity !== lastIntensity ||
                currentMode !== lastMode ||
                currentLayer !== lastLayer;

            // 3. Size Guard
            if (rect.width === 0 || rect.height === 0) {
                if (lastRect) fireStore.removeElement(id);
                lastRect = null;
                return;
            }

            // 4. Update
            if (posChanged || styleChanged || force) {
                fireStore.updateElement(id, {
                    x: rect.left,
                    y: rect.top,
                    width: rect.width,
                    height: rect.height,
                    intensity: intensity,
                    color: finalColor,
                    layer: currentLayer as any,
                    mode: (explicitMode || currentMode) as any
                });

                lastRect = rect;
                lastFinalColor = finalColor;
                lastIntensity = intensity;
                lastMode = currentMode;
                lastLayer = currentLayer;
            }
        });
    };

    // Use ResizeObserver for efficient updates when size changes
    let resizeFrame: number;
    const resizeObserver = new ResizeObserver(() => {
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => update());
    });
    resizeObserver.observe(node);

    let frameId: number;
    const loop = () => {
        if (settingsState.enableBurningBorders && options) {
            update();
        }
        frameId = requestAnimationFrame(loop);
    };

    // Initial start
    requestAnimationFrame(() => {
        update(true);
        loop();
    });

    return {
        update(newOptions: BurnOptions | undefined) {
            options = newOptions;
            cachedThemeColor = ""; // Reset cache on explicit option change
            requestAnimationFrame(() => update(true));
        },
        destroy() {
            resizeObserver.disconnect();
            cancelAnimationFrame(resizeFrame);
            cancelAnimationFrame(frameId);
            fireStore.removeElement(id);
            node.removeAttribute("data-burn-id");
        }
    };
}
