import { browser } from '$app/environment';

export function getComputedColor(varName: string): string {
    if (!browser) return '';
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

/**
 * Converts a hex string (e.g. #RRGGBB) to rgba string (e.g. rgba(R, G, B, alpha))
 * Handles short hex #RGB too.
 */
export function hexToRgba(hex: string, alpha: number = 1): string {
    if (!hex) return '';

    // Remove hash
    hex = hex.replace('#', '');

    // Handle short hex
    if (hex.length === 3) {
        hex = hex.split('').map(char => char + char).join('');
    }

    if (hex.length !== 6) {
        // Fallback for invalid hex or complex CSS values (like color-mix) that we can't easily parse here
        // If it's not a hex, it might be an rgb/rgba string or a color name.
        // For simplicity, if it's not hex, return as is (and ignore alpha override if not easy)
        // Or better, let's try to return it. If it's 'rgba(...)', we could replace alpha?
        // For now, assume it's hex if we want to use this util.
        return `#${hex}`;
    }

    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
