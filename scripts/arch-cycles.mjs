#!/usr/bin/env node
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

/**
 * arch-cycles.mjs — the import-graph cycle ratchet (W1-02, BUG-0799).
 *
 * The 2026-11-03 structure audit reported one strongly connected component of
 * 237 files spanning all four layers. That number is reproducible, but only
 * under a wide definition of "import": it counts `import type` statements and
 * `import()` calls as edges. Measured precisely, this tree has three different
 * graphs, and they say different things:
 *
 *   static value imports       4 cycles, largest 8 modules
 *   + `import()`               1 cycle,  199 modules
 *   + `import()` + `import type`  1 cycle, 237 modules   <- the audit's figure
 *
 * So the headline number is not a load-order hazard. Type imports are erased
 * at compile time, and the lazy edges are registries that pull their entries
 * on demand (`AlertPanelView.svelte` maps tab ids to `() => import(…)`). What
 * remains after removing both is four small genuine cycles.
 *
 * That is why the ratchet freezes three things, not one. Each is a different
 * question with a different fix:
 *
 *   1. `static.sccs` — load-order cycles. These are the ones that actually
 *      break: a value read from a partially initialised module. Small today,
 *      and they must stay small.
 *   2. `static.layerPairs` — how many imports cross each layer boundary. SCC
 *      size is a lagging indicator: a new `services -> stores` import *inside*
 *      an existing cycle changes its size by exactly zero. The per-pair count
 *      is the leading indicator, and the uphill pairs (`services -> stores`,
 *      `lib -> stores`, `lib -> services`, …) are the direction the layering
 *      forbids.
 *   3. `combined.sccs` and `lazy.layerPairs` — the 199-module blob that exists
 *      once lazy edges count. It is not a crash risk, but it is why the
 *      layering cannot be separated: every one of those modules can reach every
 *      other at runtime. Freezing it keeps it from growing while the burn-down
 *      happens.
 *
 * WHAT DOES NOT COUNT
 *
 *   - `import type` / `export type`: erased at compile time, and the ESLint
 *     boundary rules explicitly allow them. Counting them would report cycles
 *     the boundary gate permits.
 *   - Text inside comments. This repository documents its own imports in JSDoc
 *     blocks; a plain regex scan reads those examples as edges and invents
 *     cycles. `stripComments` runs first for that reason.
 *   - `*.test.ts`, `*.spec.ts`, `*.bench.ts`, `*.d.ts`: tests may import across
 *     layers freely and are never bundled; declaration files have no runtime.
 *
 * KNOWN LIMITATION
 *
 * `import()` with a computed specifier (`import(\`./tabs/${name}\`)`) cannot be
 * resolved statically and is invisible to every count here. The codebase has
 * none today; if one is added, the graph silently loses that edge.
 *
 * CLI
 *
 *   node scripts/arch-cycles.mjs                    report, then check
 *   node scripts/arch-cycles.mjs --json             machine-readable report
 *   node scripts/arch-cycles.mjs --update-baseline  freeze the current state
 *
 * `--update-baseline` refuses to raise any value. A ratchet that can be raised
 * is not a ratchet; when it reports a regression, the fix is the code, not the
 * number.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* ------------------------------------------------------------------ layers */

/**
 * Target layering from `eslint.config.js`: lower rank feeds higher rank.
 * An edge the other way round is "uphill" — the direction the boundary gates
 * forbid and the direction that makes a cycle impossible to break apart.
 *
 * `routes`, `workers`, `actions`, `hooks` and `locales` are entry points or
 * assets rather than links in that chain, so they are unranked and never
 * reported as uphill.
 */
const LAYER_RANK = Object.freeze({
  components: 0,
  stores: 1,
  services: 2,
  lib: 3,
  utils: 4,
});

/** `src/services/foo/bar.ts` -> `services`. Unranked segments stay as-is. */
export function layerOf(filePath) {
  const normalized = filePath.split(path.sep).join("/");
  const parts = normalized.split("/");
  const srcIndex = parts.indexOf("src");
  const segment = srcIndex >= 0 ? parts[srcIndex + 1] : undefined;
  return segment || "other";
}

/** True when an import crosses a layer boundary against the target chain. */
export function isUphill(fromLayer, toLayer) {
  const from = LAYER_RANK[fromLayer];
  const to = LAYER_RANK[toLayer];
  if (from === undefined || to === undefined) return false;
  return from > to;
}

/* ----------------------------------------------------------- source text */

/**
 * Remove comments while leaving string literals intact.
 *
 * Necessary, not cosmetic — see the module doc block. `<!-- … -->` is handled
 * too, because `.svelte` files carry markup.
 */
export function stripComments(source) {
  let out = "";
  let i = 0;
  let state = "code";

  while (i < source.length) {
    const char = source[i];
    const next = source[i + 1];

    if (state === "code") {
      if (char === "/" && next === "/") {
        state = "line";
        i += 2;
        continue;
      }
      if (char === "/" && next === "*") {
        state = "block";
        i += 2;
        continue;
      }
      if (char === "<" && source.startsWith("<!--", i)) {
        state = "markup";
        i += 4;
        continue;
      }
      if (char === '"') state = "double";
      else if (char === "'") state = "single";
      else if (char === "`") state = "template";
      out += char;
      i += 1;
      continue;
    }

    if (state === "line") {
      if (char === "\n") {
        state = "code";
        out += char;
      }
      i += 1;
      continue;
    }

    if (state === "block") {
      if (char === "*" && next === "/") {
        state = "code";
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }

    if (state === "markup") {
      if (char === "-" && source.startsWith("-->", i)) {
        state = "code";
        i += 3;
        continue;
      }
      i += 1;
      continue;
    }

    // Inside a string literal: copy verbatim, honour escapes, close on the
    // same quote that opened it.
    if (char === "\\") {
      out += char + (next ?? "");
      i += 2;
      continue;
    }
    if (
      (state === "double" && char === '"') ||
      (state === "single" && char === "'") ||
      (state === "template" && char === "`")
    ) {
      state = "code";
    }
    out += char;
    i += 1;
  }

  return out;
}

const STATIC_FROM = /\bfrom\s*["']([^"']+)["']/g;
const STATIC_BARE = /\bimport\s*["']([^"']+)["']/g;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

/** `import type …` / `export type …` — erased at compile time. */
function startsTypeOnly(prefix) {
  const statementStart = prefix.lastIndexOf(";");
  const statement = statementStart >= 0 ? prefix.slice(statementStart + 1) : prefix;
  return /^\s*(?:import|export)\s+type\b/.test(statement);
}

/**
 * Every module specifier in one file, split by how it is loaded.
 * `staticSpecifiers` are the load-order edges; `dynamicSpecifiers` are the
 * lazy edges, counted separately and never mixed into the static graph.
 */
export function extractSpecifiers(source) {
  const code = stripComments(source);
  const staticSpecifiers = [];
  const dynamicSpecifiers = [];
  const seen = new Set();

  const collect = (regex, target, { checkTypeOnly }) => {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(code))) {
      if (checkTypeOnly && startsTypeOnly(code.slice(0, match.index))) continue;
      const key = `${target === staticSpecifiers ? "s" : "d"}:${match[1]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      target.push(match[1]);
    }
  };

  collect(STATIC_FROM, staticSpecifiers, { checkTypeOnly: true });
  collect(STATIC_BARE, staticSpecifiers, { checkTypeOnly: false });
  collect(DYNAMIC_IMPORT, dynamicSpecifiers, { checkTypeOnly: false });

  return { staticSpecifiers, dynamicSpecifiers };
}

/* -------------------------------------------------------------- resolving */

const RESOLVE_SUFFIXES = Object.freeze([
  "",
  ".ts",
  ".svelte",
  ".js",
  "/index.ts",
  "/index.svelte",
]);

function resolveCandidate(base, fileSet) {
  for (const suffix of RESOLVE_SUFFIXES) {
    const candidate = base + suffix;
    if (fileSet.has(candidate)) return candidate;
  }
  return null;
}

/**
 * Resolve one specifier against the scanned file set.
 * Returns `null` for anything outside the tree (npm packages, `$app/*` virtual
 * modules, `?raw` assets) — those are not part of the cycle graph.
 */
export function resolveSpecifier(fromFile, specifier, fileSet) {
  const clean = specifier.split(/[?#]/)[0];

  if (clean.startsWith("$lib/")) {
    return resolveCandidate(`src/lib/${clean.slice("$lib/".length)}`, fileSet);
  }
  if (!clean.startsWith("./") && !clean.startsWith("../")) return null;

  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), clean));
  return resolveCandidate(base, fileSet);
}

function isRelativeSpecifier(specifier) {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

/* ---------------------------------------------------------------- sources */

export const DEFAULT_EXCLUDE = Object.freeze([
  /\.test\.ts$/,
  /\.spec\.ts$/,
  /\.bench\.ts$/,
  /\.d\.ts$/,
]);

/**
 * Read every TypeScript and Svelte module under `srcDir`.
 * Returned paths are repo-relative and posix, so `layerOf` and the baseline
 * file stay platform-independent.
 */
export function readSources(srcDir, { exclude = DEFAULT_EXCLUDE } = {}) {
  const sources = [];

  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|svelte)$/.test(entry.name)) continue;
      const repoRelative = `src/${path.relative(srcDir, full).split(path.sep).join("/")}`;
      if (exclude.some((pattern) => pattern.test(repoRelative))) continue;
      sources.push({ path: repoRelative, source: readFileSync(full, "utf8") });
    }
  };

  walk(srcDir);
  sources.sort((a, b) => a.path.localeCompare(b.path));
  return sources;
}

/* ------------------------------------------------------------------ graph */

/**
 * Two adjacency maps over the same node set: `static` (load-order) and
 * `lazy` (only `import()`). `combined` is the union and is materialised by
 * `mergeAdjacency` where it is needed.
 */
export function buildImportGraph(sources) {
  const fileSet = new Set(sources.map((entry) => entry.path));
  const staticEdges = new Map();
  const lazyEdges = new Map();
  const unresolved = [];

  for (const { path: file, source } of sources) {
    const { staticSpecifiers, dynamicSpecifiers } = extractSpecifiers(source);
    const staticTargets = new Set();
    const lazyTargets = new Set();

    for (const specifier of staticSpecifiers) {
      const target = resolveSpecifier(file, specifier, fileSet);
      if (target && target !== file) staticTargets.add(target);
      else if (!target && isRelativeSpecifier(specifier)) {
        unresolved.push({ from: file, specifier });
      }
    }

    for (const specifier of dynamicSpecifiers) {
      const target = resolveSpecifier(file, specifier, fileSet);
      if (target && target !== file) lazyTargets.add(target);
    }

    staticEdges.set(file, [...staticTargets].sort());
    lazyEdges.set(file, [...lazyTargets].sort());
  }

  return { files: sources.map((entry) => entry.path), staticEdges, lazyEdges, unresolved };
}

function mergeAdjacency(files, ...maps) {
  const merged = new Map();
  for (const file of files) {
    const targets = new Set();
    for (const map of maps) {
      for (const target of map.get(file) ?? []) targets.add(target);
    }
    merged.set(file, [...targets].sort());
  }
  return merged;
}

function countEdges(adjacency) {
  let total = 0;
  for (const targets of adjacency.values()) total += targets.length;
  return total;
}

/* -------------------------------------------------------------------- scc */

/**
 * Tarjan's algorithm. Returns only components with more than one member — a
 * single node is trivially reachable from itself and is not a cycle.
 *
 * Recursive on purpose: the scanned tree is a few hundred modules and the
 * deepest chain is far below any stack limit. If that ever stops being true,
 * the failure is a loud stack overflow, not a silently truncated result.
 */
export function findStronglyConnectedComponents(files, adjacency) {
  let counter = 0;
  const index = new Map();
  const lowlink = new Map();
  const onStack = new Set();
  const stack = [];
  const components = [];

  const visit = (node) => {
    index.set(node, counter);
    lowlink.set(node, counter);
    counter += 1;
    stack.push(node);
    onStack.add(node);

    for (const neighbour of adjacency.get(node) ?? []) {
      if (!index.has(neighbour)) {
        visit(neighbour);
        lowlink.set(node, Math.min(lowlink.get(node), lowlink.get(neighbour)));
      } else if (onStack.has(neighbour)) {
        lowlink.set(node, Math.min(lowlink.get(node), index.get(neighbour)));
      }
    }

    if (lowlink.get(node) === index.get(node)) {
      const component = [];
      let member;
      do {
        member = stack.pop();
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      if (component.length > 1) components.push(component.sort());
    }
  };

  for (const node of files) {
    if (!index.has(node)) visit(node);
  }

  return components;
}

/* ------------------------------------------------------------------ pairs */

export function layerPairCounts(adjacency) {
  const counts = new Map();

  for (const [from, targets] of adjacency) {
    const fromLayer = layerOf(from);
    for (const to of targets) {
      const key = `${fromLayer}->${layerOf(to)}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return Object.fromEntries([...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

/** Layers present in one SCC, largest first — the report's "what is inside". */
function layerBreakdown(members) {
  const counts = new Map();
  for (const member of members) {
    const layer = layerOf(member);
    counts.set(layer, (counts.get(layer) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([layer, count]) => `${layer}=${count}`);
}

function describeCycles(files, adjacency) {
  return findStronglyConnectedComponents(files, adjacency)
    .map((members) => ({
      size: members.length,
      sample: members[0],
      layers: layerBreakdown(members),
      members,
    }))
    .sort((a, b) => b.size - a.size || a.sample.localeCompare(b.sample));
}

/* ---------------------------------------------------------------- analyse */

export function analyse(sources) {
  const graph = buildImportGraph(sources);
  const combined = mergeAdjacency(graph.files, graph.staticEdges, graph.lazyEdges);

  return {
    fileCount: graph.files.length,
    staticEdgeCount: countEdges(graph.staticEdges),
    lazyEdgeCount: countEdges(graph.lazyEdges),
    static: {
      sccs: describeCycles(graph.files, graph.staticEdges),
      layerPairs: layerPairCounts(graph.staticEdges),
    },
    lazy: {
      layerPairs: layerPairCounts(graph.lazyEdges),
    },
    combined: {
      sccs: describeCycles(graph.files, combined),
    },
    dynamicEdges: [...graph.lazyEdges].flatMap(([from, targets]) =>
      targets.map((to) => ({ from, to })),
    ),
    unresolved: graph.unresolved,
  };
}

/* --------------------------------------------------------------- baseline */

/** The persisted shape: sizes plus one stable anchor per SCC, nothing else. */
export function toBaseline(result) {
  const cycles = (group) =>
    group.sccs.map(({ size, sample }) => ({ size, sample }));

  return {
    note:
      "Burn-down only. Regenerate with `node scripts/arch-cycles.mjs --update-baseline`, " +
      "which refuses to raise a value. Lower it in the PR that removes the cycle or the edge. " +
      "`static` counts value imports, `combined` adds import(), `lazy` counts import() alone — " +
      "see the header of scripts/arch-cycles.mjs for why all three are gated.",
    // Spread, not the live object: a caller that mutates the returned baseline
    // to simulate drift must not mutate the measurement it is compared against.
    static: { sccs: cycles(result.static), layerPairs: { ...result.static.layerPairs } },
    lazy: { layerPairs: { ...result.lazy.layerPairs } },
    combined: { sccs: cycles(result.combined) },
  };
}

/**
 * Compare one group of cycles against its baseline.
 *
 * Matching is by *anchor* (`sample`: the alphabetically first member), not by
 * size, so two cycles of similar size cannot silently swap identities. An
 * anchor that left every cycle reads as a shrink, not as a regression — an
 * improvement must never turn the gate red.
 */
function compareCycles(currentSccs, baselineSccs, label, failures, improvements) {
  const matchedAnchors = new Set();

  for (const entry of baselineSccs ?? []) {
    const current = currentSccs.find((scc) => scc.members.includes(entry.sample));
    if (!current) {
      improvements.push(
        `[${label}] the cycle anchored at ${entry.sample} is gone (was ${entry.size} files) — lower the baseline`,
      );
      continue;
    }
    matchedAnchors.add(current.sample);
    if (current.size > entry.size) {
      failures.push(
        `[${label}] the cycle anchored at ${entry.sample} grew: ${entry.size} -> ${current.size} files (${current.layers.join(" ")})`,
      );
    } else if (current.size < entry.size) {
      improvements.push(
        `[${label}] the cycle anchored at ${entry.sample} shrank: ${entry.size} -> ${current.size} files — lower the baseline`,
      );
    }
  }

  for (const scc of currentSccs) {
    if (matchedAnchors.has(scc.sample)) continue;
    failures.push(
      `[${label}] new cycle of ${scc.size} files at ${scc.sample} (${scc.layers.join(" ")}) — not covered by the baseline`,
    );
  }
}

function compareLayerPairs(current, baseline, label, failures, improvements, allowNewDownhillPairs) {
  for (const [pair, count] of Object.entries(current)) {
    const allowed = baseline?.[pair];
    if (allowed === undefined) {
      const [from, to] = pair.split("->");
      if (isUphill(from, to)) {
        failures.push(
          `[${label}] new uphill import pair ${pair} (${count} edges) — this is the direction the layering forbids`,
        );
      } else if (!allowNewDownhillPairs) {
        failures.push(`[${label}] new import pair ${pair} (${count} edges) — not covered by the baseline`);
      }
    } else if (count > allowed) {
      failures.push(`[${label}] ${pair} grew: ${allowed} -> ${count} edges`);
    } else if (count < allowed) {
      improvements.push(`[${label}] ${pair} shrank: ${allowed} -> ${count} edges — lower the baseline`);
    }
  }

  for (const pair of Object.keys(baseline ?? {})) {
    if (!(pair in current)) {
      improvements.push(`[${label}] ${pair} is gone from the graph — lower the baseline`);
    }
  }
}

/**
 * Compare a measurement against the frozen baseline.
 *
 * `allowNewDownhillPairs` exists for exactly one caller: `--update-baseline`.
 * A layer pair that never existed before is normally a failure worth a human
 * decision, but the target layering permits new *downhill* imports by design —
 * a component starting to read from `services` is not a regression. Uphill
 * pairs stay refused in both modes, and so does every cycle change: those are
 * the two things the ratchet exists to prevent.
 */
export function compareToBaseline(result, baseline, { allowNewDownhillPairs = false } = {}) {
  const failures = [];
  const improvements = [];

  if (result.fileCount === 0 || result.staticEdgeCount === 0) {
    failures.push("the analyser found no files or no static edges — a graph that empty proves nothing");
  }

  compareCycles(result.static.sccs, baseline.static?.sccs, "static", failures, improvements);
  compareLayerPairs(
    result.static.layerPairs,
    baseline.static?.layerPairs,
    "static",
    failures,
    improvements,
    allowNewDownhillPairs,
  );
  compareCycles(result.combined.sccs, baseline.combined?.sccs, "combined", failures, improvements);
  compareLayerPairs(
    result.lazy.layerPairs,
    baseline.lazy?.layerPairs,
    "lazy",
    failures,
    improvements,
    allowNewDownhillPairs,
  );

  return { failures, improvements };
}

/* ------------------------------------------------------------------- cli */

function printCycles(title, sccs) {
  if (sccs.length === 0) {
    console.log(`\n${title}: none.`);
    return;
  }
  console.log(`\n${title} (${sccs.length}):`);
  for (const scc of sccs) {
    console.log(`  · ${scc.size} modules (${scc.layers.join(" ")})`);
    console.log(`    anchor: ${scc.sample}`);
  }
}

function printUphill(pairs, title) {
  const uphill = Object.entries(pairs)
    .filter(([pair]) => {
      const [from, to] = pair.split("->");
      return isUphill(from, to);
    })
    .sort((a, b) => b[1] - a[1]);

  if (uphill.length === 0) return;
  console.log(`\n${title}:`);
  for (const [pair, count] of uphill) console.log(`  ${pair.padEnd(26)} ${count}`);
}

function printReport(result) {
  console.log(
    `Import graph: ${result.fileCount} modules, ${result.staticEdgeCount} static value edges, ` +
      `${result.lazyEdgeCount} lazy import() edges.`,
  );

  printCycles("Load-order cycles (static value imports)", result.static.sccs);
  printCycles("Dependency cycles (static + lazy)", result.combined.sccs);
  printUphill(result.static.layerPairs, "Uphill static import pairs");
  printUphill(result.lazy.layerPairs, "Uphill lazy import pairs");

  if (result.unresolved.length > 0) {
    console.log(
      `\nUnresolved relative specifiers (${result.unresolved.length}) — assets and out-of-tree ` +
        `files; informational only:`,
    );
    for (const { from, specifier } of result.unresolved.slice(0, 6)) {
      console.log(`  ${from} -> ${specifier}`);
    }
    if (result.unresolved.length > 6) {
      console.log(`  … ${result.unresolved.length - 6} more`);
    }
  }
}

function main(argv) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const baselinePath = path.join(repoRoot, "scripts", "arch-cycles.baseline.json");
  const wantsUpdate = argv.includes("--update-baseline");
  const wantsJson = argv.includes("--json");

  const result = analyse(readSources(path.join(repoRoot, "src")));

  if (wantsJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  printReport(result);

  const existing = existsSync(baselinePath)
    ? JSON.parse(readFileSync(baselinePath, "utf8"))
    : null;

  if (wantsUpdate) {
    if (existing) {
      const { failures } = compareToBaseline(result, existing, { allowNewDownhillPairs: true });
      if (failures.length > 0) {
        console.error("\n❌ refusing to raise the baseline:");
        for (const failure of failures) console.error(`   - ${failure}`);
        console.error("\nA ratchet that can be raised is not a ratchet. Fix the regression instead.");
        process.exit(1);
      }
    }
    writeFileSync(baselinePath, `${JSON.stringify(toBaseline(result), null, 2)}\n`);
    console.log(`\n✅ baseline written: ${path.relative(repoRoot, baselinePath)}`);
    return;
  }

  if (!existing) {
    console.error("\n❌ no baseline yet — run with --update-baseline once.");
    process.exit(1);
  }

  const { failures, improvements } = compareToBaseline(result, existing);

  if (improvements.length > 0) {
    console.log("\nLower the baseline (improvements, not failures):");
    for (const improvement of improvements) console.log(`  · ${improvement}`);
  }

  if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} regression(s) against the baseline:`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }

  console.log("\n✅ no regression against the baseline.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
