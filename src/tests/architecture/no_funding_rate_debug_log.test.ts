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
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const FORBIDDEN_MARKER = "FUNDING RATE RAW";
/** The whole directory, not a hand-picked pair of files. `bitunixWs/` holds
 *  three files; a re-add in the third was invisible while the list named two. */
const WS_DIR = path.join(REPO_ROOT, "src", "services", "bitunixWs");
const SCANNED_FILES = [
    path.join(REPO_ROOT, "src", "services", "bitunixWs.ts"),
    ...readdirSync(WS_DIR, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith(".ts") && !e.name.includes(".test."))
        .map((e) => path.join(WS_DIR, e.name)),
];

/** A log line carrying the raw funding payload, however it is worded. */
function leaksRawFundingRate(source: string): boolean {
    return new RegExp(
        `\\b(?:log|warn|error|debug|info)\\s*\\([^)]*fundingRate[^)]*\\)`,
        "i",
    ).test(source);
}

describe("BUG-0249 — no funding-rate debug log left behind", () => {
    it.each(SCANNED_FILES)("%s does not log the raw funding-rate debug marker", (file) => {
        const content = readFileSync(file, "utf-8");
        expect(content).not.toContain(FORBIDDEN_MARKER);
        expect(content).not.toContain("debugLogRawFundingRate");
    });

    it("does not log the raw funding payload under any wording", () => {
        for (const file of SCANNED_FILES) {
            expect(
                leaksRawFundingRate(readFileSync(file, "utf-8")),
                `${file} logs the raw funding-rate payload`,
            ).toBe(false);
        }
    });

    // Without this, a matcher that stops matching is indistinguishable from a
    // clean tree — the vacuity failure `order_gate_bypass.test.ts` and
    // `boundary_allowlist.test.ts` both guard against explicitly, and this
    // file was the one guard in the directory that did not.
    it("still detects a reworded leak it is meant to catch", () => {
        expect(leaksRawFundingRate(`logger.log("net", \`[NETWORK] \${JSON.stringify({ fundingRate: r })}\`);`)).toBe(true);
        // …and does not fire on the shape it must ignore.
        expect(leaksRawFundingRate(`logger.debug("net", "funding rate subscription opened");`)).toBe(false);
    });
});
