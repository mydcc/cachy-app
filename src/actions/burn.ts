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

    // Track style state to avoid redundant store updates
    let lastFinalColor = "";
    let lastIntensity = -1;
    let lastMode = "";
    let cachedThemeColor = "";
    let lastThemeCheck = 0;

    /**
     * Resolves the final color based on settings and options.
     * Logic is optimized to avoid repetitive getComputedStyle calls.
     */
    const resolveColor = (inputColor?: string): string => {
        const mode = settingsState.borderEffectColorMode;

        if (mode === "theme") {
            const now = Date.now();
            // Throttled check for theme color every 500ms or if mode changed
            if (lastMode !== "theme" || !cachedThemeColor || now - lastThemeCheck > 500) {
                const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim();
                cachedThemeColor = accent || "#ff8800";
                lastThemeCheck = now;
            }
            return cachedThemeColor;
        }

        // Reset cache when leaving theme mode
        cachedThemeColor = "";

        if (mode === "custom") {
            return settingsState.borderEffectCustomColor;
        }

        // Interactive mode: use the color passed via options
        if (inputColor?.startsWith('var(')) {
            const varName = inputColor.match(/var\(([^)]+)\)/)?.[1];
            if (varName) {
                return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || "#ff8800";
            }
        }

        return inputColor ?? "#ffaa00";
    };

    const update = (force = false) => {
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
        const finalColor = resolveColor(options.color).toLowerCase();
        const intensity = options.intensity ?? 1.0;
        const currentMode = settingsState.borderEffectColorMode;
        const styleChanged = finalColor !== lastFinalColor.toLowerCase() || intensity !== lastIntensity || currentMode !== lastMode;

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
                color: finalColor
            });

            lastRect = rect;
            lastFinalColor = finalColor;
            lastIntensity = intensity;
            lastMode = currentMode;
        }
    };

    // Use ResizeObserver for efficient updates when size changes
    // Decouple using requestAnimationFrame to avoid "Loop limit exceeded" in microtasks
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

    update(true);
    loop();

    return {
        update(newOptions: BurnOptions | undefined) {
            options = newOptions;
            cachedThemeColor = ""; // Reset cache on explicit option change
            update(true);
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
