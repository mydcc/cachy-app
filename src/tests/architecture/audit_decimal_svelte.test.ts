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

// @vitest-environment node

/*
 * BUG-0534 — `scripts/audit-decimal.mjs` walked `.ts` files only, so a
 * native-number conversion on a financial value inside a component's
 * `<script>` block passed CI silently. The documented decimal rule was
 * enforced in components by reviewers' eyes only.
 *
 * These tests run the real script against a fixture tree rather than reading
 * it, because the thing that has to hold is the script's *behaviour*: the
 * pre-fix script walked no `.svelte` file at all, so a fixture-based test that
 * only asserted the source text would pass against the unfixed script.
 *
 * The fixtures live in `scripts/__fixtures__/audit-decimal/`, outside `src/`
 * on purpose — a fixture under `src/` would fail the real run, which is the
 * opposite of what a fixture is for.
 */

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SCRIPT = path.join(REPO_ROOT, "scripts", "audit-decimal.mjs");
const FIXTURES = "scripts/__fixtures__/audit-decimal";

/**
 * Runs the audit against one fixture case; returns its exit code and output.
 * One directory per case, so an assertion cannot be satisfied by a sibling.
 */
function audit(fixture: string) {
    const result = spawnSync(process.execPath, [SCRIPT, `${FIXTURES}/${fixture}`], {
        cwd: REPO_ROOT,
        encoding: "utf-8",
    });
    if (result.error) throw result.error;
    return { code: result.status, out: `${result.stdout}${result.stderr}` };
}

describe("BUG-0534 — the decimal audit covers .svelte components", () => {
    it("flags a native conversion in a component's script block", () => {
        // The fixture imports no decimal.js. An import gate would skip it —
        // and a component that converts a price with parseFloat instead of
        // using Decimal is exactly the file this check exists to catch.
        const { code, out } = audit("unsafe-component");
        expect(out).toContain("unsafe-component.svelte");
        expect(out).toContain("parseFloat(value)");
        expect(code).toBe(1);
    });

    it("flags a native conversion in a markup expression", () => {
        // The script scans whole lines, so template expressions are covered
        // by the same rule as the <script> block.
        const { code, out } = audit("unsafe-markup");
        expect(out).toContain("unsafe-markup.svelte");
        expect(out).toContain("Number(realized)");
        expect(code).toBe(1);
    });

    it("accepts a component conversion that carries the safe marker", () => {
        const { code } = audit("safe-marked");
        expect(code).toBe(0);
    });

    it("accepts a marked conversion in a template expression", () => {
        // A line comment is not a comment in a template and an HTML comment is
        // not valid inside an attribute list, so the marker needs a third
        // form there. Without it, exempting a conversion in a template
        // expression would break the component rather than document it.
        const { code } = audit("safe-marked-markup");
        expect(code).toBe(0);
    });

    it("does not read a conversion in a comment as a call site", () => {
        // Both markup comment forms, because a component is walked line by
        // line and `<script>` comments are not the only kind it contains.
        const { code } = audit("comment-only");
        expect(code).toBe(0);
    });

    it("still flags a .ts Decimal importer, unchanged", () => {
        const { code, out } = audit("unsafe-decimal");
        expect(out).toContain("unsafe-decimal.ts");
        expect(code).toBe(1);
    });

    it("reports both file kinds in its summary", () => {
        // The summary is what a reader of a CI log sees first; a count that
        // silently omits components would make the gate look narrower than it
        // is. The case holds one clean file of each kind, so it exits 0.
        const { code, out } = audit("summary");
        expect(out).toContain("1 .ts file(s)");
        expect(out).toContain("1 .svelte file(s)");
        expect(code).toBe(0);
    });
});
