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

import { describe, it, expect } from "vitest";
import { windowRegistry } from "./WindowRegistry.svelte";
import type { WindowType } from "./types";

/**
 * Runtime mirror of the `WindowType` union, used only by the assertion below.
 *
 * The authoritative exhaustiveness guard is now compile-time and lives in
 * `WindowRegistry.svelte.ts` (`buildDefaultConfigs(): Record<WindowType,
 * WindowConfig>`). That file is compiled by `svelte-check`, unlike this one --
 * `tsconfig.json` excludes `*.test.ts` -- so a union member added without a
 * config fails `npm run check` there (BUG-0434). This record is kept as a
 * belt-and-braces runtime check that `getConfig()` returns a dedicated config
 * rather than the generic fallback.
 */
const ALL_WINDOW_TYPES: Record<WindowType, true> = {
    window: true,
    modal: true,
    iframe: true,
    chart: true,
    news: true,
    settings: true,
    chatbox: true,
    symbolpicker: true,
    journal: true,
    guide: true,
    changelog: true,
    privacy: true,
    whitepaper: true,
    assistant: true,
    channel: true,
    academy: true,
    dialog: true,
    alertpanel: true,
};

describe("WindowRegistry (FEAT-0050)", () => {
    it("has a registered config for every WindowType union member", () => {
        for (const type of Object.keys(ALL_WINDOW_TYPES) as WindowType[]) {
            const config = windowRegistry.getConfig(type);
            expect(config.type, `expected a dedicated config for '${type}'`).toBe(type);
        }
    });

    it("falls back to the 'window' config for an unregistered type", () => {
        // Cast past the union on purpose -- this simulates a type that was
        // removed from the registry (or never added), which getConfig()
        // must survive rather than throw.
        const unknownType = "does-not-exist" as WindowType;
        const config = windowRegistry.getConfig(unknownType);
        const windowConfig = windowRegistry.getConfig("window");

        expect(config.type).toBe(windowConfig.type);
        expect(config.layout).toEqual(windowConfig.layout);
    });

    it("keeps reader windows large, unresizable and mobile-fullscreen (BUG-0411 reader class)", () => {
        for (const type of ["guide", "changelog", "privacy", "whitepaper"] as WindowType[]) {
            const config = windowRegistry.getConfig(type);
            expect(config.flags.isResizable, `${type} must not show a resize handle`).toBe(false);
            expect(config.flags.isResponsive, `${type} must go fullscreen on mobile`).toBe(true);
            expect(config.flags.edgeToEdgeBreakpoint).toBe(768);
        }
    });

    it("keeps the alert panel a singleton via the flag WindowBase actually reads (FEAT-0389)", () => {
        // WindowBase enforces single-instance through `!allowMultipleInstances`
        // -- `maxInstances` is declared in types.ts but read nowhere, so an
        // assertion against it would pass while the panel opened twice. Pin the
        // flag that carries the behaviour.
        const config = windowRegistry.getConfig("alertpanel");
        expect(
            config.flags.allowMultipleInstances ?? false,
            "a second alert panel would edit the same draft rule from two places"
        ).toBe(false);
    });
});

/**
 * FEAT-0389 -- "the chart stays visible and interactive beside it".
 *
 * That criterion is not implemented in the panel's own markup; it is these
 * three registry flags. A backdrop would cover the chart, `closeOnBlur` would
 * dismiss the panel the moment the trader touched the chart, and centring
 * would drop it on top of the thing it is meant to sit beside. The modal this
 * replaced had all three, so a well-meaning "make it consistent with the other
 * windows" edit is exactly how the old defect comes back.
 */
describe("WindowRegistry: the alert panel is not a modal (FEAT-0389)", () => {
    const config = windowRegistry.getConfig("alertpanel");

    it("shows no backdrop, so the chart behind it stays visible", () => {
        expect(config.flags.showBackdrop).toBe(false);
    });

    it("survives a click on the chart", () => {
        expect(config.flags.closeOnBlur).toBe(false);
    });

    it("opens beside the chart rather than centred over it", () => {
        expect(config.flags.centerByDefault).toBe(false);
    });

    it("allows only one panel, so the bell cannot stack duplicates", () => {
        expect(config.flags.maxInstances).toBe(1);
    });
});
