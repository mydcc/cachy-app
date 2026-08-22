/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

// @vitest-environment node

/*
 * BUG-0249 — `debugLogRawFundingRate()` in bitunixWs.ts spammed the browser
 * console with `[NETWORK] [FUNDING RATE RAW]` on every private WS funding
 * push. It has been removed; this test reads the source so a re-add is
 * caught in CI rather than by a user staring at their devtools again.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const FORBIDDEN_MARKER = "FUNDING RATE RAW";
const SCANNED_FILES = [
    path.join(REPO_ROOT, "src", "services", "bitunixWs.ts"),
    path.join(REPO_ROOT, "src", "services", "bitunixWs", "channelDispatch.ts"),
];

describe("BUG-0249 — no funding-rate debug log left behind", () => {
    it.each(SCANNED_FILES)("%s does not log the raw funding-rate debug marker", (file) => {
        const content = readFileSync(file, "utf-8");
        expect(content).not.toContain(FORBIDDEN_MARKER);
        expect(content).not.toContain("debugLogRawFundingRate");
    });
});
