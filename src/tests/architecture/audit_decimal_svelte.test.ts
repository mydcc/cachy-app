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
 * BUG-0534 — `scripts/audit-decimal.mjs` walked `.ts` files only, so a
 * native-number conversion on a financial value inside a component's
 * `<script>` block passed CI silently. The documented decimal rule was
 * enforced in components by reviewers' eyes only.
 *
 * These tests call the script's exported `auditDirectory()` against a fixture
 * tree, because the thing that has to hold is its *behaviour*: the pre-fix
 * script walked no `.svelte` file at all, so a test that only asserted the
 * source text would pass against the unfixed script.
 *
 * The fixtures live in `scripts/__fixtures__/audit-decimal/`, outside `src/`
 * on purpose — a fixture under `src/` would fail the real run, which is the
 * opposite of what a fixture is for. They are reached by a literal path here
 * rather than through a command-line argument: an earlier version of this PR
 * took a directory as an argument, which put a caller-controlled string into a
 * path expression inside the script (CodeQL `js/path-injection`) and made a
 * build script that would read any path it was handed.
 */

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { auditDirectory } from "../../../scripts/audit-decimal.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SCRIPT = path.join(REPO_ROOT, "scripts", "audit-decimal.mjs");
const FIXTURES = path.join(REPO_ROOT, "scripts", "__fixtures__", "audit-decimal");

/**
 * Audits one fixture case.
 *
 * One case per directory, so an assertion cannot be satisfied by a sibling: a
 * case that must fail cannot be rescued by a clean file next to it, and a case
 * that must pass cannot be broken by an unsafe one.
 */
async function audit(fixtureCase: string) {
    return await auditDirectory(path.join(FIXTURES, fixtureCase));
}

function violations(result: { findings: Array<{ kind: string; file: string; text: string }> }) {
    return result.findings.filter((f) => f.kind === "violation");
}

describe("BUG-0534 — the decimal audit covers .svelte components", () => {
    it("flags a native conversion in a component's script block", async () => {
        // The fixture imports no decimal.js. An import gate would skip it —
        // and a component that converts a price with parseFloat instead of
        // using Decimal is exactly the file this check exists to catch.
        const result = await audit("unsafe-component");
        expect(violations(result)).toHaveLength(1);
        expect(violations(result)[0].file).toContain("unsafe-component.svelte");
        expect(violations(result)[0].text).toContain("parseFloat(value)");
    });

    it("flags a native conversion in a markup expression", async () => {
        // The audit scans whole lines, so template expressions are covered by
        // the same rule as the <script> block.
        const result = await audit("unsafe-markup");
        expect(violations(result)).toHaveLength(1);
        expect(violations(result)[0].file).toContain("unsafe-markup.svelte");
    });

    it("accepts a component conversion that carries the safe marker", async () => {
        const result = await audit("safe-marked");
        expect(result.findings).toHaveLength(0);
    });

    it("accepts a marked conversion in a template expression", async () => {
        // A line comment is not a comment in a template and an HTML comment is
        // not valid inside an attribute list, so the marker needs a third form
        // there. Without it, exempting a conversion in a template expression
        // would break the component rather than document it.
        const result = await audit("safe-marked-markup");
        expect(result.findings).toHaveLength(0);
    });

    it("rejects an exemption that carries no reason", async () => {
        // The reason is the point of the marker: without it the exemption is an
        // unreviewable claim, and an unreviewable claim is what this script
        // exists to prevent. A bare marker must fail, and as its own kind of
        // failure rather than being silently accepted like a marked line.
        const result = await audit("unreasoned");
        expect(result.findings).toHaveLength(1);
        expect(result.findings[0].kind).toBe("unreasoned");
        expect(result.unreasoned).toBe(1);
    });

    it("does not read a conversion in a comment as a call site", async () => {
        // Both comment forms a component can carry that the repo's linter
        // accepts: the word must not become a violation just because the
        // component was walked for the first time.
        const result = await audit("comment-only");
        expect(result.findings).toHaveLength(0);
    });

    it("still flags a .ts Decimal importer, unchanged", async () => {
        const result = await audit("unsafe-decimal");
        expect(violations(result)).toHaveLength(1);
        expect(violations(result)[0].file).toContain("unsafe-decimal.ts");
    });

    it("reports both file kinds in its counts", async () => {
        // The counts are what a reader of a CI log sees first; a count that
        // silently omits components would make the gate look narrower than it
        // is. The case holds one clean file of each kind, so it is empty.
        const result = await audit("summary");
        expect(result.tsScanned).toBe(1);
        expect(result.svelteScanned).toBe(1);
    });

    it("exits 0 on the real tree", () => {
        // The end-to-end half: the CLI, the exit code CI reads, over src/.
        // A fixture-only suite would pass while the job itself was red.
        const run = spawnSync(process.execPath, [SCRIPT], {
            cwd: REPO_ROOT,
            encoding: "utf-8",
        });
        if (run.error) throw run.error;
        expect(run.status).toBe(0);
        expect(run.stdout).toContain("✅");
    });
});

describe("BUG-0571 — the decimal audit sees reference passing", () => {
    it("flags a conversion passed by reference in a component's script block", async () => {
        // prices.map(Number) is the same conversion as Number(x) with the
        // syntax on the other side of the identifier. The call-only pattern
        // required an opening parenthesis right after the name, so a bare
        // reference passed the audit silently.
        const result = await audit("map-reference");
        expect(violations(result)).toHaveLength(2);
        expect(violations(result)[0].file).toContain("map-reference.svelte");
        expect(violations(result)[0].text).toContain(".map(Number)");
        expect(violations(result)[1].text).toContain(".map(parseFloat)");
    });
});
