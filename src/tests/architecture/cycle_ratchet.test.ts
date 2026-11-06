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
 * re-measures on every run and fails if a cycle grew, if a new cycle appeared,
 * or if an uphill layer pair gained edges.
 *
 * Two axes on purpose. A new `services -> stores` import *inside* the existing
 * 197-module blob changes the SCC size by exactly zero, so a size-only gate
 * would stay green while the layering eroded further. The per-pair count is
 * the leading indicator; the SCC size is the one that catches a cycle forming
 * where there was none.
 *
 * Both directions are asserted. A ratchet that only checks for growth cannot
 * tell "the graph got better" from "the measurement stopped working" — the
 * second one is the failure the existing `boundary_allowlist.test.ts` was
 * written to catch, and it applies here for the same reason.
 *
 * The self-tests pin the analyser's decisions. Each one corresponds to a real
 * shape in this tree: `import type` as the first statement of a `<script>`
 * block, an inline `{ type X }` specifier, `import("./x").Member` inside a type
 * annotation, and an import quoted inside a comment. A regex gets all four
 * wrong, which is why the analyser parses instead.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
	analyse,
	compareToBaseline,
	decide,
	extractSpecifiers,
	isInTreeSpecifier,
	isUphill,
	layerOf,
	readSources,
	resolveSpecifier,
	toBaseline,
} from "../../../scripts/arch-cycles.mjs";
import { compareBaselineRatchet } from "../../../scripts/arch-baseline-guard.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const BASELINE = JSON.parse(
	readFileSync(path.join(REPO_ROOT, "scripts", "arch-cycles.baseline.json"), "utf-8"),
);

function sourcesOf(files: Record<string, string>) {
	return Object.entries(files).map(([filePath, source]) => ({ path: filePath, source }));
}

const sources = readSources(path.join(REPO_ROOT, "src"));
const result = analyse(sources);

describe("the ratchet is measured against a frozen baseline", () => {
	it("scans a graph large enough for the gate to mean something", () => {
		// A walker that stopped finding files would make every assertion below
		// vacuously true. This is the cheapest way to notice that.
		expect(result.fileCount).toBeGreaterThan(500);
		expect(result.staticEdgeCount).toBeGreaterThan(1000);
	});

	it("leaves test code out of the graph", () => {
		// Test fixtures are never bundled and may import across layers freely,
		// so counting them would freeze coupling that does not ship.
		const paths = sources.map((entry) => entry.path);
		expect(paths.filter((file) => /\.(test|spec|bench)\.ts$/.test(file))).toEqual([]);
		expect(paths.filter((file) => /\.d\.ts$/.test(file))).toEqual([]);
		expect(paths.filter((file) => file.startsWith("src/tests/"))).toEqual([]);
	});

	it("anchors every baseline cycle on a file that still exists", () => {
		// If an anchor file is renamed, the comparator reports a new cycle and a
		// vanished baseline entry. Both are true, but the root cause is the
		// dangling anchor, and naming it saves the reader the detour.
		const scanned = new Set(sources.map((entry) => entry.path));
		const anchors = [...BASELINE.static.sccs, ...BASELINE.combined.sccs].map(
			(entry: { sample: string }) => entry.sample,
		);
		expect(anchors.filter((anchor) => !scanned.has(anchor))).toEqual([]);
	});

	it("freezes an entry for every uphill pair the graph still has", () => {
		for (const pair of Object.keys(result.static.uphillPairs)) {
			expect(BASELINE.static.uphillPairs).toHaveProperty(pair);
		}
		for (const pair of Object.keys(result.lazy.uphillPairs)) {
			expect(BASELINE.lazy.uphillPairs).toHaveProperty(pair);
		}
	});

	it("has not regressed", () => {
		expect(compareToBaseline(result, BASELINE).failures).toEqual([]);
	});

	it("has not drifted out from under the baseline either", () => {
		// An analyser that stopped seeing edges leaves `failures` empty. The
		// improvement list is what makes that visible, and it costs nothing when
		// the tree and the baseline agree — which they must, between changes.
		const { improvements } = compareToBaseline(result, BASELINE);
		expect(
			improvements,
			"the baseline is stale: either a cycle or an uphill edge was removed (lower the baseline in this PR) " +
				"or the analyser stopped seeing it (a regression in scripts/arch-cycles.mjs)",
		).toEqual([]);
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

		// Entry points and leaf vocabularies are not links in the chain.
		expect(isUphill("routes", "stores")).toBe(false);
		expect(isUphill("workers", "services")).toBe(false);
		expect(isUphill("types", "stores")).toBe(false);
	});

	it("resolves $lib, query suffixes and honest misses", () => {
		const tree = new Set(["src/lib/x.ts", "src/lib/window/index.ts"]);
		expect(resolveSpecifier("src/components/a.svelte", "$lib/x", tree)).toBe("src/lib/x.ts");
		expect(resolveSpecifier("src/components/a.svelte", "$lib/window", tree)).toBe(
			"src/lib/window/index.ts",
		);
		expect(resolveSpecifier("src/components/a.svelte", "../lib/x.ts?raw", tree)).toBe("src/lib/x.ts");
		expect(resolveSpecifier("src/components/a.svelte", "../lib/missing", tree)).toBe(null);
		expect(resolveSpecifier("src/components/a.svelte", "decimal.js", tree)).toBe(null);
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
		// The repository documents its own imports in JSDoc, so an example
		// quoted in a comment is a real false positive, not a hypothetical one.
		const probe = analyse(
			sourcesOf({
				"src/lib/a.ts":
					'/*\n * Example: import { b } from "./b";\n */\n// import { b } from "./b";\nexport const a = 1;',
				"src/lib/b.ts": 'import { a } from "./a";\nexport const b = a;',
			}),
		);

		expect(probe.static.sccs).toEqual([]);
	});

	it("does not count an `import type` statement as an edge", () => {
		const probe = analyse(
			sourcesOf({
				"src/lib/a.ts": 'import type { B } from "./b";\nexport type A = B;',
				"src/lib/b.ts": 'import { a } from "./a";\nexport const b = a;',
			}),
		);

		expect(probe.static.sccs).toEqual([]);
	});

	it("does not count an inline `{ type X }` specifier as an edge", () => {
		// `marketWatcher/historyFetcher.ts` and `subscriptionRegistry.ts` import
		// each other this way. Counting it froze a phantom 5-module cycle that
		// is 4 modules at runtime — and it would hide a later change from
		// `type` to value, which is exactly the edge the ratchet exists for.
		const probe = analyse(
			sourcesOf({
				"src/lib/a.ts": 'import { type B } from "./b";\nexport const a = 1;',
				"src/lib/b.ts": 'import { a } from "./a";\nexport const b = a;',
			}),
		);

		expect(probe.static.sccs).toEqual([]);
	});

	it("does not count `import(\"./x\").T` in a type annotation as a lazy edge", () => {
		// That is an ImportTypeNode, erased like any other type. Four live
		// occurrences connect modules that never load each other.
		const probe = analyse(
			sourcesOf({
				"src/lib/a.ts": 'export type X = import("./b").Thing;',
				"src/lib/b.ts": 'import { a } from "./a";\nexport const b = a;',
			}),
		);

		expect(probe.lazyEdgeCount).toBe(0);
		expect(probe.combined.sccs).toEqual([]);
	});

	it("keeps a runtime import() out of the load-order graph and inside the dependency graph", () => {
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
		expect(failures.some((failure: string) => failure.includes("new cycle of 2 files"))).toBe(true);
	});

	it("reports an uphill pair the baseline does not know about", () => {
		// This import creates no cycle at all, so a size-only ratchet would wave
		// it through. It is the case the pair axis exists for.
		const probe = analyse(
			sourcesOf({
				"src/services/reader.ts": 'import { state } from "../stores/s";\nexport const read = state;',
				"src/stores/s.ts": "export const state = 1;",
			}),
		);
		expect(probe.static.sccs).toEqual([]);

		const frozen = toBaseline(probe);
		delete frozen.static.uphillPairs["services->stores"];

		const { failures } = compareToBaseline(probe, frozen);
		expect(
			failures.some((failure: string) =>
				failure.includes("new uphill import pair services->stores"),
			),
		).toBe(true);
	});

	it("reports an uphill pair that gained an edge", () => {
		// The leading indicator: same pair, no new cycle, one more module
		// reached. Two imports from the *same* store would stay one edge.
		const before = analyse(
			sourcesOf({
				"src/services/reader.ts": 'import { state } from "../stores/s";\nexport const read = state;',
				"src/stores/s.ts": "export const state = 1;",
				"src/stores/t.ts": "export const other = 2;",
			}),
		);
		const after = analyse(
			sourcesOf({
				"src/services/reader.ts":
					'import { state } from "../stores/s";\nimport { other } from "../stores/t";\nexport const read = state + other;',
				"src/stores/s.ts": "export const state = 1;",
				"src/stores/t.ts": "export const other = 2;",
			}),
		);

		const { failures } = compareToBaseline(after, toBaseline(before));
		expect(failures.some((failure: string) => failure.includes("services->stores grew: 1 -> 2"))).toBe(
			true,
		);
	});

	it("does not fail on a downhill pair that grew", () => {
		// A component importing from a service is what the layering wants.
		// Freezing it would make every feature PR edit the baseline.
		const before = analyse(
			sourcesOf({
				"src/components/a.svelte": '<script>import { read } from "../services/s";</script>',
				"src/services/s.ts": "export const read = 1;\nexport const write = 2;",
			}),
		);
		const after = analyse(
			sourcesOf({
				"src/components/a.svelte":
					'<script>import { read, write } from "../services/s";export const x = read + write;</script>',
				"src/services/s.ts": "export const read = 1;\nexport const write = 2;",
			}),
		);

		expect(compareToBaseline(after, toBaseline(before)).failures).toEqual([]);
	});

	it("reports a cycle that shrank, without failing", () => {
		const frozen = toBaseline(
			analyse(
				sourcesOf({
					"src/lib/a.ts": 'import { b } from "./b";\nexport const a = b;',
					"src/lib/b.ts": 'import { c } from "./c";\nexport const b = c;',
					"src/lib/c.ts": 'import { a } from "./a";\nexport const c = a;',
				}),
			),
		);
		frozen.static.sccs[0].size = 5;

		const probe = analyse(
			sourcesOf({
				"src/lib/a.ts": 'import { b } from "./b";\nexport const a = b;',
				"src/lib/b.ts": 'import { c } from "./c";\nexport const b = c;',
				"src/lib/c.ts": 'import { a } from "./a";\nexport const c = a;',
			}),
		);

		const { failures, improvements } = compareToBaseline(probe, frozen);
		expect(failures).toEqual([]);
		expect(improvements.some((line: string) => line.includes("shrank: 5 -> 3"))).toBe(true);
	});

	it("reports a renamed anchor as both a vanishing cycle and a new one", () => {
		const frozen = toBaseline(
			analyse(
				sourcesOf({
					"src/lib/a.ts": 'import { b } from "./b";\nexport const a = b;',
					"src/lib/b.ts": 'import { a } from "./a";\nexport const b = a;',
				}),
			),
		);

		const renamed = analyse(
			sourcesOf({
				"src/lib/a2.ts": 'import { b } from "./b";\nexport const a = b;',
				"src/lib/b.ts": 'import { a } from "./a2";\nexport const b = a;',
			}),
		);

		const { failures, improvements } = compareToBaseline(renamed, frozen);
		expect(improvements.some((line: string) => line.includes("anchored at src/lib/a.ts is gone"))).toBe(
			true,
		);
		expect(failures.some((line: string) => line.includes("new cycle of 2 files at src/lib/a2.ts"))).toBe(
			true,
		);
	});

	it("fails an empty measurement instead of passing it", () => {
		const { failures } = compareToBaseline(analyse([]), { static: {}, lazy: {}, combined: {} });
		expect(failures.some((line: string) => line.includes("a graph that empty proves nothing"))).toBe(true);
	});
});

describe("the CLI only writes when the ratchet allows it", () => {
	const clean = analyse(
		sourcesOf({
			"src/services/reader.ts": 'import { state } from "../stores/s";\nexport const read = state;',
			"src/stores/s.ts": "export const state = 1;",
			"src/stores/t.ts": "export const other = 2;",
		}),
	);
	const frozen = toBaseline(clean);
	const regressed = analyse(
		sourcesOf({
			"src/services/reader.ts":
				'import { state } from "../stores/s";\nimport { other } from "../stores/t";\nexport const read = state + other;',
			"src/stores/s.ts": "export const state = 1;",
			"src/stores/t.ts": "export const other = 2;",
		}),
	);

	it("refuses --update-baseline while a regression exists", () => {
		const outcome = decide({ result: regressed, baseline: frozen, wantsInit: false, wantsUpdate: true });
		expect(outcome.action).toBe("refuse");
		expect(outcome.failures.some((line: string) => line.includes("services->stores grew"))).toBe(true);
	});

	it("writes on --update-baseline when only the baseline is stale", () => {
		const outcome = decide({ result: clean, baseline: frozen, wantsInit: false, wantsUpdate: true });
		expect(outcome.action).toBe("write");
	});

	it("fails a plain check when a regression exists", () => {
		const outcome = decide({ result: regressed, baseline: frozen, wantsInit: false, wantsUpdate: false });
		expect(outcome.action).toBe("fail");
	});

	it("does not let a missing baseline pass as a clean check", () => {
		expect(decide({ result: clean, baseline: null, wantsInit: false, wantsUpdate: false }).action).toBe(
			"error",
		);
	});

	it("requires --init, not --update-baseline, to create the first baseline", () => {
		expect(decide({ result: clean, baseline: null, wantsInit: true, wantsUpdate: false }).action).toBe(
			"write",
		);
		expect(decide({ result: clean, baseline: frozen, wantsInit: true, wantsUpdate: false }).action).toBe(
			"refuse",
		);
	});
});

describe("the analyser does not lose an edge it could have counted", () => {
	it("resolves an ESM `.js` specifier to its TypeScript source", () => {
		// A specifier names the built file; the source sits next to it under a
		// different extension. Without the rewrite the edge resolves to nothing
		// and the graph is simply missing a link.
		const tree = new Set(["src/lib/x.ts", "src/lib/store.svelte.ts"]);
		expect(resolveSpecifier("src/lib/a.ts", "./x.js", tree)).toBe("src/lib/x.ts");
		expect(resolveSpecifier("src/lib/a.ts", "./store.svelte.js", tree)).toBe(
			"src/lib/store.svelte.ts",
		);
	});

	it("treats a written-out `import()` of a plain string as the edge it is", () => {
		// A template literal with no substitution loads exactly one module, so
		// calling it "dynamic" and dropping it loses a real edge.
		const { lazySpecifiers, computedSpecifiers } = extractSpecifiers(
			"src/lib/a.ts",
			"export const load = () => import(`./b`);",
		);

		expect(lazySpecifiers).toEqual(["./b"]);
		expect(computedSpecifiers).toEqual([]);
	});

	it("records a computed `import()` instead of dropping it", () => {
		const { lazySpecifiers, computedSpecifiers } = extractSpecifiers(
			"src/lib/a.ts",
			"export const load = (name) => import(`./tabs/${name}`);",
		);

		expect(lazySpecifiers).toEqual([]);
		expect(computedSpecifiers).toEqual(["`./tabs/${name}`"]);
	});

	it("fails an import that points into src/ and matches no scanned module", () => {
		// A dropped edge is worse than a cycle: the graph silently gets smaller
		// and every later measurement inherits the hole.
		const probe = analyse(
			sourcesOf({
				"src/lib/a.ts": 'import { b } from "./missing";\nimport { c } from "./c";\nexport const a = b + c;',
				"src/lib/c.ts": "export const c = 1;",
			}),
		);

		const { failures } = compareToBaseline(probe, toBaseline(probe));
		expect(failures.some((line: string) => line.includes("the edge is missing from the graph"))).toBe(
			true,
		);
	});

	it("leaves an asset import alone", () => {
		// `?raw` and a `.css` import are not modules, so not finding them in the
		// file set is correct and says nothing about the graph.
		const probe = analyse(
			sourcesOf({
				"src/lib/a.ts":
					'import icon from "./icon.svg?raw";\nimport "../app.css";\nimport { b } from "./b";\nexport const a = icon + b;',
				"src/lib/b.ts": "export const b = 1;",
			}),
		);

		expect(probe.unresolved.map((entry: { specifier: string }) => entry.specifier)).toEqual([
			"./icon.svg?raw",
			"../app.css",
		]);
		expect(probe.unresolved.filter((entry: { specifier: string; from: string }) =>
			isInTreeSpecifier(entry.specifier, entry.from),
		)).toEqual([]);
		expect(compareToBaseline(probe, toBaseline(probe)).failures).toEqual([]);
	});
});
