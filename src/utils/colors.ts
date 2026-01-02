import { browser } from '$app/environment';

/**
 * Retrieves the computed value of a CSS variable.
 * @param variableName The name of the CSS variable (e.g., '--primary-color').
 * @param element The element to check (defaults to document.body).
 * @returns The computed value (trimmed) or a fallback if not found/SSR.
 */
export function getComputedColor(variableName: string, element?: HTMLElement): string {
    if (!browser) return '#000000';

    const target = element || document.body;
    const value = getComputedStyle(target).getPropertyValue(variableName).trim();

    // Return empty string if variable is not defined, let caller handle fallback if needed
    return value;
}

/**
 * Converts a Hex color string to an RGBA string.
 * @param hex The hex color string (e.g., '#ffffff', '#fff').
 * @param alpha The alpha value (0-1).
 * @returns The RGBA string (e.g., 'rgba(255, 255, 255, 0.5)').
 */
export function hexToRgba(hex: string, alpha: number): string {
    if (!hex || !hex.startsWith('#')) return `rgba(0, 0, 0, ${alpha})`;

    let c = hex.substring(1).split('');
    if (c.length === 3) {
        c = [c[0], c[0], c[1], c[1], c[2], c[2]];
    }

    if (c.length !== 6) return `rgba(0, 0, 0, ${alpha})`;

    const n = Number('0x' + c.join(''));
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
