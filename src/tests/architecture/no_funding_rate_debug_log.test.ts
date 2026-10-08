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
/** The whole directory, recursively — not a hand-picked pair of files.
 *  `bitunixWs/` holds three files today; a re-add in the third was invisible
 *  while the list named two, and a future subdirectory would be invisible to
 *  a flat `readdirSync`. Test and bench files never ship, so they stay out. */
const WS_DIR = path.join(REPO_ROOT, "src", "services", "bitunixWs");
const SCANNED_FILES: string[] = [
    path.join(REPO_ROOT, "src", "services", "bitunixWs.ts"),
];
(function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(full);
        } else if (
            entry.name.endsWith(".ts") &&
            !entry.name.includes(".test.") &&
            !entry.name.includes(".bench.") &&
            !entry.name.includes(".spec.")
        ) {
            SCANNED_FILES.push(full);
        }
    }
})(WS_DIR);

/**
 * A log call carrying the raw funding payload, however it is worded.
 *
 * Two deliberate choices, both fail-closed. First, the window: up to 500
 * chars of call text, so a helper call before the payload
 * (`log(tag(x), { fundingRate })`) still matches — a `[^)]*` window ends at
 * the first `)` and misses exactly that. Second, the identifier:
 * `fundingRate`, `funding_rate` (the shape exchange JSON uses) and
 * `funding rate` all match, case-insensitively.
 *
 * Known limits, stated not hidden: a payload logged under an unrelated name
 * (`JSON.stringify(message)`) is unattributable to any spelling and is not
 * caught — that needs payload-shape matching, not identifier matching. And
 * yes, a legitimate scalar-only log ("funding rate updated", rate) would
 * fire too; that is the bias a leak guard wants, and the day one is needed
 * it gets an explicit allowlist line instead of a weaker matcher.
 */
function leaksRawFundingRate(source: string): boolean {
    return new RegExp(
        `\\b(?:log|warn|error|debug|info)\\s*\\([\\s\\S]{0,500}?funding[_ ]?rate`,
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
        // Helper call before the payload: the old `[^)]*` window ended at
        // the `)` of `tag(x)` and missed exactly this.
        expect(leaksRawFundingRate(`logger.log("net", tag(x), data.funding_rate);`)).toBe(true);
        // …and does not fire where no log call carries it: comments, type
        // shapes and bare strings are not leaks.
        expect(leaksRawFundingRate(`// funding rate notes for the next reader`)).toBe(false);
        expect(leaksRawFundingRate(`interface Quote { fundingRate: string }`)).toBe(false);
        expect(leaksRawFundingRate(`const label = "funding rate subscription opened";`)).toBe(false);
    });

    // The scan set itself is a contract: three files today, and a future
    // subdirectory must extend it rather than escape it.
    it("scans the top-level file plus every non-test file under bitunixWs/", () => {
        expect(SCANNED_FILES.length).toBeGreaterThanOrEqual(3);
        expect(SCANNED_FILES).toContain(
            path.join(REPO_ROOT, "src", "services", "bitunixWs.ts"),
        );
    });
});
