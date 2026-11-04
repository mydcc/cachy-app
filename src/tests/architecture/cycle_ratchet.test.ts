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
 * W1-02 / BUG-0799 — the import graph must not get more entangled than it is.
 *
 * `scripts/arch-cycles.mjs` measures the graph and
 * `scripts/arch-cycles.baseline.json` freezes it. This file is the gate: it
 * re-measures on every run and fails if any cycle grew, if a new cycle
 * appeared, or if a layer pair gained edges.
 *
 * Two axes on purpose. A new `services -> stores` import *inside* the existing
 * 199-module blob changes the SCC size by exactly zero, so a size-only gate
 * would stay green while the layering eroded further. The per-pair edge count
 * is the leading indicator; the SCC size is the one that catches a cycle
 * forming where there was none.
 *
 * The self-tests below exist because a ratchet that silently stops matching is
 * worse than no ratchet — it reads as a guarantee. Each one pins a decision the
 * analyser makes (comments are not imports, `import type` is not an edge,
 * `import()` is not a load-order edge) and one proves the comparator reports
 * growth, which is the only claim that matters.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
	analyse,
	compareToBaseline,
	isUphill,
	layerOf,
	readSources,
	toBaseline,
} from "../../../scripts/arch-cycles.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const BASELINE = JSON.parse(
	readFileSync(path.join(REPO_ROOT, "scripts", "arch-cycles.baseline.json"), "utf-8"),
);

function sourcesOf(files: Record<string, string>) {
	return Object.entries(files).map(([filePath, source]) => ({ path: filePath, source }));
}

const sources = readSources(path.join(REPO_ROOT, "src"));
const result = analyse(sources);

describe("architecture cycle ratchet is measured against a frozen baseline", () => {
	it("scans a graph large enough for the gate to mean something", () => {
		// A walker that stopped finding files would make every assertion below
		// vacuously true. This is the cheapest way to notice that.
		expect(result.fileCount).toBeGreaterThan(500);
		expect(result.staticEdgeCount).toBeGreaterThan(1000);
	});

	it("records every layer pair it claims to gate", () => {
		expect(Object.keys(BASELINE.static.layerPairs).length).toBeGreaterThan(0);
		expect(Array.isArray(BASELINE.static.sccs)).toBe(true);
		expect(Array.isArray(BASELINE.combined.sccs)).toBe(true);
	});

	it("anchors every baseline cycle on a file that still exists", () => {
		// If an anchor file is renamed, the comparator sees a cycle it does not
		// know and a baseline entry that vanished. Both are reported — but a
		// dangling anchor is the root cause, and naming it saves the reader a
		// detour.
		const scanned = new Set(sources.map((entry) => entry.path));
		const anchors = [...BASELINE.static.sccs, ...BASELINE.combined.sccs].map(
			(entry: { sample: string }) => entry.sample,
		);
		expect(anchors.filter((anchor) => !scanned.has(anchor))).toEqual([]);
	});

	it("has not regressed", () => {
		const { failures } = compareToBaseline(result, BASELINE);
		expect(failures).toEqual([]);
	});
});

describe("the analyser agrees with the layering it enforces", () => {
	it("reads the layer from the path under src", () => {
		expect(layerOf("src/services/bitunixWs.ts")).toBe("services");
		expect(layerOf("src/lib/windows/WindowManager.svelte.ts")).toBe("lib");
		expect(layerOf("src/components/shared/Button.svelte")).toBe("components");
		expect(layerOf("server/spacetimedb/index.ts")).toBe("other");
	});

	it("calls an import uphill only when it runs against the target chain", () => {
		// components -> stores -> services -> lib -> utils
		expect(isUphill("services", "stores")).toBe(true);
		expect(isUphill("lib", "stores")).toBe(true);
		expect(isUphill("lib", "services")).toBe(true);
		expect(isUphill("utils", "lib")).toBe(true);

		expect(isUphill("stores", "services")).toBe(false);
		expect(isUphill("components", "stores")).toBe(false);
		expect(isUphill("services", "lib")).toBe(false);

		// Entry points are not links in the chain, so they can never be uphill.
		expect(isUphill("routes", "stores")).toBe(false);
		expect(isUphill("workers", "services")).toBe(false);
	});
});

describe("the analyser reports what it claims to report", () => {
	it("finds a two-module value cycle", () => {
		const probe = analyse(
			sourcesOf({
				"src/lib/a.ts": 'import { b } from "./b";\nexport const a = b;',
				"src/lib/b.ts": 'import { a } from "./a";\nexport const b = a;',
			}),
		);

		expect(probe.static.sccs.map((scc: { size: number }) => scc.size)).toEqual([2]);
	});

	it("reports no cycle for a chain", () => {
		const probe = analyse(
			sourcesOf({
				"src/lib/a.ts": 'import { b } from "./b";\nexport const a = b;',
				"src/lib/b.ts": 'import { c } from "./c";\nexport const b = c;',
				"src/lib/c.ts": "export const c = 1;",
			}),
		);

		expect(probe.static.sccs).toEqual([]);
	});

	it("does not read an import written inside a comment", () => {
		// Without comment stripping this is a 2-cycle that does not exist.
		// The repository documents its own imports in JSDoc, so this is a real
		// false positive, not a hypothetical one.
		const probe = analyse(
			sourcesOf({
				"src/lib/a.ts":
					'/*\n * Example: import { b } from "./b";\n */\n// import { b } from "./b";\nexport const a = 1;',
				"src/lib/b.ts": 'import { a } from "./a";\nexport const b = a;',
			}),
		);

		expect(probe.static.sccs).toEqual([]);
	});

	it("does not count a type-only import as an edge", () => {
		const probe = analyse(
			sourcesOf({
				"src/lib/a.ts": 'import type { B } from "./b";\nexport type A = B;',
				"src/lib/b.ts": 'import { a } from "./a";\nexport const b = a;',
			}),
		);

		expect(probe.static.sccs).toEqual([]);
	});

	it("keeps a lazy import out of the load-order graph and inside the dependency graph", () => {
		const probe = analyse(
			sourcesOf({
				"src/lib/a.ts": 'export const load = () => import("./b");',
				"src/lib/b.ts": 'import { load } from "./a";\nexport const b = load;',
			}),
		);

		// Nothing loads b at import time, so there is no load-order cycle…
		expect(probe.static.sccs).toEqual([]);
		// …but the two modules can still reach each other at runtime.
		expect(probe.combined.sccs.map((scc: { size: number }) => scc.size)).toEqual([2]);
	});
});

describe("the comparator reports the regressions it exists for", () => {
	it("reports a cycle that grew", () => {
		const probe = analyse(
			sourcesOf({
				"src/lib/a.ts": 'import { b } from "./b";\nexport const a = b;',
				"src/lib/b.ts": 'import { c } from "./c";\nexport const b = c;',
				"src/lib/c.ts": 'import { a } from "./a";\nexport const c = a;',
			}),
		);

		const frozen = toBaseline(probe);
		frozen.static.sccs[0].size = 2;

		const { failures } = compareToBaseline(probe, frozen);
		expect(failures.some((failure: string) => failure.includes("grew: 2 -> 3"))).toBe(true);
	});

	it("reports a cycle the baseline does not know about", () => {
		const frozen = toBaseline(
			analyse(
				sourcesOf({
					"src/lib/a.ts": "export const a = 1;",
					"src/lib/b.ts": 'import { a } from "./a";\nexport const b = a;',
				}),
			),
		);

		const probe = analyse(
			sourcesOf({
				"src/lib/a.ts": 'import { b } from "./b";\nexport const a = b;',
				"src/lib/b.ts": 'import { a } from "./a";\nexport const b = a;',
			}),
		);

		const { failures } = compareToBaseline(probe, frozen);
		expect(
			failures.some((failure: string) => failure.includes("new cycle of 2 files")),
		).toBe(true);
	});

	it("reports an uphill pair the baseline does not know about", () => {
		// The point of the pair axis: this import creates no cycle at all, so a
		// size-only ratchet would wave it through.
		const probe = analyse(
			sourcesOf({
				"src/services/reader.ts": 'import { state } from "../stores/s";\nexport const read = state;',
				"src/stores/s.ts": "export const state = 1;",
			}),
		);
		expect(probe.static.sccs).toEqual([]);

		const frozen = toBaseline(probe);
		delete frozen.static.layerPairs["services->stores"];

		const { failures } = compareToBaseline(probe, frozen);
		expect(
			failures.some((failure: string) =>
				failure.includes("new uphill import pair services->stores"),
			),
		).toBe(true);
	});

	it("tells a new downhill pair apart from a new uphill one", () => {
		// Only `--update-baseline` passes `allowNewDownhillPairs`. It has to:
		// a component reading from a service is what the layering wants, so
		// recording that pair must not require a code change. An uphill pair
		// stays refused in both modes.
		const probe = analyse(
			sourcesOf({
				"src/components/panel.svelte":
					'<script>import { read } from "../services/reader";</script>',
				"src/services/reader.ts": "export const read = 1;",
			}),
		);

		const frozen = toBaseline(probe);
		delete frozen.static.layerPairs["components->services"];

		const strict = compareToBaseline(probe, frozen);
		expect(
			strict.failures.some((failure: string) =>
				failure.includes("new import pair components->services"),
			),
		).toBe(true);

		const update = compareToBaseline(probe, frozen, { allowNewDownhillPairs: true });
		expect(update.failures).toEqual([]);
	});
});
