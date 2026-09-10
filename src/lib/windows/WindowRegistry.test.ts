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
 * A `Record<WindowType, true>` rather than a plain array: if a new member is
 * ever added to the `WindowType` union without a matching entry here,
 * `npm run check` fails to compile this file (missing key), and if an entry
 * here stops matching a real union member, it fails the same way (excess
 * key). The list can't silently drift out of sync with `types.ts` the way a
 * hand-maintained array could -- this is the mechanism that "would have
 * caught chatpanel" (FEAT-0050's own framing).
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
