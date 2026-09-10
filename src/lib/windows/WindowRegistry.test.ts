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
 * A `Record<WindowType, true>` rather than a plain array, so that a member added
 * to the `WindowType` union without a matching entry here is a type error.
 *
 * NOTE (BUG-0434): that type error is currently never surfaced. `tsconfig.json`
 * excludes every test file from compilation, so `svelte-check` never reads this one, and
 * Vitest transpiles it without type checking. `alertpanel` went missing here
 * exactly that way. Treat this record as documentation until the invariant is
 * moved somewhere the compiler reads -- it is not a safety net today.
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
