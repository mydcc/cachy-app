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
});
