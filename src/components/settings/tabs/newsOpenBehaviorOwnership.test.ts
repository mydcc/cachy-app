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

/*
 * BUG-0729 — the news open behaviour belongs to one settings tab. The duplicate
 * in AiTab arrived by copy-paste and would arrive that way again, and no
 * component test mounts both tabs, so the invariant is pinned at the source
 * level: the setting may be read or written by exactly one tab component.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const tabsDir = dirname(fileURLToPath(import.meta.url));

describe("BUG-0729 — the news open behaviour has one home", () => {
    it("is read or written by exactly one settings tab", () => {
        const owners = readdirSync(tabsDir)
            .filter((file) => file.endsWith(".svelte"))
            .filter((file) =>
                readFileSync(join(tabsDir, file), "utf8").includes(
                    "settingsState.newsOpenBehavior",
                ),
            )
            .sort();

        expect(owners).toEqual(["VisualsLayout.svelte"]);
    });
});
