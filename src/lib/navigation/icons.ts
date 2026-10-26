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

import { icons } from "../constants";

/**
 * Trusted icons for registry entries. Only constants live here; no user input.
 * The rail keys are the inline SVGs moved out of `LeftControlPanel` when the
 * rail became a registry view. Settings-tab icon keys are deliberately absent
 * until that surface is migrated.
 */
const RAIL_ICONS: Record<string, string> = {
    "rail-dashboard": `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>`,
    "rail-alerts": `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>`,
    "rail-academy": `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M12 14l9-5-9-5-9 5 9 5z" /><path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222" /></svg>`,
    "rail-assistant": `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>`,
    "rail-market-overview": `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zM2.5 2a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-.5-.5h-3zm6.5.5A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zm1.5-.5a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-.5-.5h-3zM1 10.5A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm1.5-.5a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-.5-.5h-3zm6.5.5A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5v-3zm1.5-.5a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-.5-.5h-3z"/></svg>`,
    "rail-market-activity": `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>`,
    "rail-market-sentiment": `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>`,
};

/**
 * The settings rail's inline paths used to live in `SettingsContent`, wrapped
 * by `TabBar` in this exact `<svg>`. They moved here so the registry's
 * `settings-*` keys resolve to full SVG markup like every other icon key.
 */
function settingsIcon(paths: string): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

const SETTINGS_ICONS: Record<string, string> = {
    "settings-trading": settingsIcon(
        `<path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M19.07 4.93 4.93 19.07"/>`,
    ),
    "settings-automation": settingsIcon(
        `<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>`,
    ),
    "settings-chart": settingsIcon(
        `<path d="M3 3v18h18"/><path d="m7 14 4-4 4 4 5-6"/>`,
    ),
    "settings-visuals": settingsIcon(
        `<path d="M2.05 13.9a9.96 9.96 0 0 1 0-7.8"/> <path d="M8.2 21.8c-1.3-.2-2.5-.6-3.7-1.3"/> <path d="M15.8 2.2c1.3.2 2.5.6 3.7 1.3"/> <path d="M21.95 10.1a9.96 9.96 0 0 1 0 7.8"/> <path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/> <path d="M12 2a10 10 0 0 1 10 10"/>`,
    ),
    "settings-ai": settingsIcon(
        `<path d="M12 2a2 2 0 0 1 2 2c0 2.21-1.79 4-4 4s-4-1.79-4-4a2 2 0 0 1 2-2z"/><path d="M12 10c-3.31 0-6 2.69-6 6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2c0-3.31-2.69-6-6-6z"/>`,
    ),
    "settings-connections": settingsIcon(
        `<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>`,
    ),
    "settings-system": settingsIcon(
        `<path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"/><path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/><path d="M12 2v2"/><path d="M12 22v-2"/><path d="m17 7-1.4 1.4"/><path d="m19.1 4.9-1.4 1.4"/><path d="M22 12h-2"/><path d="M2 12h2"/><path d="m4.9 19.1 1.4-1.4"/><path d="m7 17 1.4 1.4"/>`,
    ),
    "settings-cloud": settingsIcon(
        `<path d="M17.5 19c0-1.7-1.3-3-3-3h-1.5c-2.8 0-5-2.2-5-5 0-2.3 1.5-4.3 3.7-4.8.8-1.8 2.6-3.2 4.8-3.2 3 0 5.5 2.5 5.5 5.5 0 .2 0 .5-.1.7 2.1.8 3.6 2.8 3.6 5.3 0 2.8-2.2 5-5 5h-4.5c-.3 0-.5-.2-.5-.5z"/>`,
    ),
};

const ICONS: Record<string, string> = {
    // Every `icons.*` constant is a valid registry key; enumerating them by
    // hand already missed `icons.check`, `icons.exchange` and
    // `icons.lockClosed` when the journal tab strip arrived.
    ...Object.fromEntries(
        Object.entries(icons).map(([key, value]): [string, string] => [
            `icons.${key}`,
            value,
        ]),
    ),
    ...RAIL_ICONS,
    ...SETTINGS_ICONS,
};

/** Returns trusted SVG markup for an entry icon key, or an empty string. */
export function resolveEntryIcon(key: string): string {
    return ICONS[key] ?? "";
}
