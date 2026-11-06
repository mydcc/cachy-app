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
 * The architecture rule the ESLint boundaries enforce is a per-file rule. The
 * property that actually degrades — "module A and module B can still reach
 * each other" — is a graph property, and nothing measured it. This does.
 *
 * WHAT THE AUDIT'S "237 FILES" MEANS
 *
 * W1-02 reported one strongly connected component of 237 files. That figure is
 * reproducible, but only when `import type` statements and `import()` calls
 * both count as edges. Measured precisely, the tree has three different
 * graphs, and they say different things:
 *
 *   static value imports            4 cycles, largest 8 modules
 *   + runtime `import()`            1 cycle,  197 modules
 *   + `import()` + `import type`      (audit measurement, not computed here)
 *
 * Type imports are erased at compile time and the ESLint boundary rules
 * explicitly allow them, so they are not a load-order hazard. The lazy edges
 * are registries that pull their entries on demand (`AlertPanelView.svelte`
 * maps tab ids to `() => import(…)`), so they are not a load-order hazard
 * either — but they do mean every module in that 197-cycle can reach every
 * other at runtime, which is why the layering cannot be separated today.
 *
 * WHAT IS GATED
 *
 *   1. `static.sccs` — load-order cycles. These are the ones that break: a
 *      value read from a partially initialised module.
 *   2. `uphillPairs` — edges that cross a layer boundary against the target
 *      chain. SCC size is a lagging indicator: a new `services -> stores`
 *      import *inside* an existing cycle changes its size by exactly zero.
 *      The per-pair count is the leading indicator, and it is the one the
 *      burn-down has to move.
 *   3. `combined.sccs` — the 197-module dependency cycle. Frozen so it cannot
 *      grow while the burn-down happens.
 *
 * Downhill pair counts are reported but deliberately *not* frozen. A component
 * importing from `services` is what the layering wants; freezing the count
 * would make every feature PR edit the baseline, and a baseline every PR edits
 * is a merge conflict in a file nobody reviews. Only the direction that is a
 * violation is ratcheted.
 *
 * WHAT COUNTS AS AN EDGE
 *
 * TypeScript's own parser decides, not a regex. That matters more than it
 * sounds: a hand-rolled scan gets four things wrong that this tree actually
 * contains — `import type` as the first statement of a `<script>` block,
 * `import { type X }` inline specifiers, `import("./x").Member` in a type
 * annotation (an `ImportTypeNode`, not a call), and imports quoted inside
 * comments. The AST has no such ambiguities.
 *
 * Excluded: `*.test.ts`, `*.spec.ts`, `*.bench.ts`, `*.d.ts`, and everything
 * under `src/tests/` — test-only fixtures are never bundled and may import
 * across layers freely.
 *
 * KNOWN LIMITATIONS
 *
 *   - `import()` with a computed specifier (`import(\`./tabs/${name}\`)`) cannot
 *     be resolved statically. It is not silently dropped: the count is reported
 *     (`computedLazy`) so the blind spot stays visible, and a template literal
 *     with no substitution is treated as the static string it is.
 *   - Only `.svelte` `<script>` blocks are read. Markup is not analysed, which
 *     is correct: markup cannot import.
 *   - `require()` is not an edge. The tree is ESM.
 *
 * WHAT THE FILE CANNOT DO BY ITSELF
 *
 * The gate compares the tree against `scripts/arch-cycles.baseline.json`, and
 * that file lives in the same commits. A change that adds an uphill edge and
 * raises the baseline to match passes — `--update-baseline` refuses a raise, a
 * hand edit does not. `scripts/arch-baseline-guard.mjs` closes that: CI reads
 * the baseline from the merge base and fails if any frozen value rose, so the
 * number this file is measured against can only move down.
 *
 * CLI
 *
 *   node scripts/arch-cycles.mjs             report, then check
 *   node scripts/arch-cycles.mjs --json      machine-readable report
 *   node scripts/arch-cycles.mjs --init      write the first baseline
 *   node scripts/arch-cycles.mjs --update-baseline
 *                                            record a burn-down
 *
 * `--update-baseline` refuses to raise any value and refuses every cycle
 * change. `--init` is separate on purpose: "the file is missing" must not be
 * indistinguishable from "reset the ratchet".
 *
 * The base-branch half of the ratchet lives in `scripts/arch-baseline-guard.mjs`
 * (run by CI); this file only ever knows about one baseline.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/**
 * Order two strings by code unit, never by locale.
 *
 * `localeCompare` was the obvious choice and the wrong one here: its result
 * depends on the ICU data of the machine, so `pairs` order — and with it the
 * baseline file — could differ between a contributor's laptop and CI for the
 * same tree. Everything compared here is an ASCII path or layer name, where
 * byte order is the only order that is the same everywhere.
 */
function byCodeUnit(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/* ------------------------------------------------------------------ layers */

/**
 * Target layering from `eslint.config.js`: lower rank feeds higher rank.
 * An edge the other way round is "uphill" — the direction the boundary gates
 * forbid and the direction that makes a cycle impossible to break apart.
 *
 * `routes`, `workers`, `actions`, `hooks`, `tests`, `locales`, `config` and
 * `types` are entry points, assets or leaf vocabularies rather than links in
 * that chain, so they are unranked and never reported as uphill.
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

// The lenient form is deliberate. Svelte only ever writes a tight lowercase
// `<script>`, but CodeQL reads a stricter-looking pattern as an HTML filter and
// fails the PR (`js/bad-html-filtering-regexp`): it wants a case-insensitive
// tag, a `</script` that tolerates whitespace and trailing attributes, and an
// opening tag that tolerates attributes. None of that can match here — a
// Svelte component has one `<script>` block — and being lenient costs nothing.
const SCRIPT_BLOCK = /<script\b[^>]*>([\s\S]*?)<\/script[^>]*>/gi;

/**
 * The TypeScript text of one module. For `.svelte` that is every `<script>`
 * block concatenated — the markup itself cannot import, and skipping it keeps
 * the parser from seeing template syntax.
 */
export function scriptText(filePath, source) {
  if (!filePath.endsWith(".svelte")) return source;

  let text = "";
  SCRIPT_BLOCK.lastIndex = 0;
  let match;
  while ((match = SCRIPT_BLOCK.exec(source))) text += `${match[1]}\n`;
  return text;
}

/**
 * Every module specifier in one file, classified by how it is loaded.
 *
 * `staticSpecifiers` are the load-order edges — value imports and re-exports.
 * `lazySpecifiers` are runtime `import()` calls. Neither includes anything the
 * compiler erases:
 *
 *   - `import type { A } from "x"`      -> importClause.isTypeOnly
 *   - `import { type A } from "x"`      -> every named binding isTypeOnly
 *   - `export { type A } from "x"`      -> every export specifier isTypeOnly
 *   - `import("x").A` in a type         -> an ImportTypeNode, never a call
 *
 * `computedSpecifiers` are the `import()` calls whose argument is a template
 * with substitutions. They cannot be resolved here, so they are reported rather
 * than dropped: an edge nobody can see is worse than one nobody can resolve.
 */
export function extractSpecifiers(filePath, source) {
  const text = scriptText(filePath, source);
  // Most files settle the question with a substring check; parsing them anyway
  // would double the cost of the gate for no answer.
  if (!text.includes("import") && !text.includes("export")) {
    return { staticSpecifiers: [], lazySpecifiers: [], computedSpecifiers: [] };
  }

  const file = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);

  const staticSpecifiers = [];
  const lazySpecifiers = [];
  const computedSpecifiers = [];

  const namedBindingsAreTypeOnly = (clause) => {
    const bindings = clause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) return false;
    return bindings.elements.length > 0 && bindings.elements.every((element) => element.isTypeOnly);
  };

  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const specifier = node.moduleSpecifier;
      if (specifier && ts.isStringLiteral(specifier)) {
        const clause = ts.isImportDeclaration(node) ? node.importClause : undefined;
        // `import D, { type A }` still binds D at runtime.
        const hasValueBinding = Boolean(clause?.name) || clause?.namedBindings?.kind === ts.SyntaxKind.NamespaceImport;
        const typeOnly = ts.isImportDeclaration(node)
          ? Boolean(clause?.isTypeOnly) || (!hasValueBinding && namedBindingsAreTypeOnly(clause))
          : node.isTypeOnly ||
            Boolean(
              node.exportClause &&
                ts.isNamedExports(node.exportClause) &&
                node.exportClause.elements.length > 0 &&
                node.exportClause.elements.every((element) => element.isTypeOnly),
            );
        if (!typeOnly) staticSpecifiers.push(specifier.text);
      }
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1
    ) {
      const [argument] = node.arguments;
      // A template literal without substitutions is a string with a different
      // syntax: `import(`./x`)` loads exactly `./x`, so dropping it as
      // "dynamic" lost a real edge.
      if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) {
        lazySpecifiers.push(argument.text);
      } else if (ts.isTemplateExpression(argument)) {
        // Genuinely computed — `import(`./tabs/${id}`)`. Not resolvable here,
        // but counted so the blind spot is visible instead of absent.
        computedSpecifiers.push(argument.getText(file));
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(file);

  return { staticSpecifiers, lazySpecifiers, computedSpecifiers };
}

/* -------------------------------------------------------------- resolving */

const RESOLVE_SUFFIXES = Object.freeze([
  "",
  ".ts",
  ".svelte",
  ".svelte.js",
  ".js",
  "/index.ts",
  "/index.svelte",
]);

/**
 * An ESM specifier names the *built* file, so `import "./x.js"` refers to
 * `x.ts` in this tree. Without the rewrite the edge resolves to nothing, and a
 * missing edge is invisible in a graph whose whole purpose is counting edges.
 */
const JS_TO_TS_SUFFIXES = Object.freeze([
  [".svelte.js", ".svelte.ts"],
  [".js", ".ts"],
  [".mjs", ".mts"],
]);

function resolveCandidate(base, fileSet) {
  for (const suffix of RESOLVE_SUFFIXES) {
    const candidate = base + suffix;
    if (fileSet.has(candidate)) return candidate;
  }
  return null;
}

function resolveEmittedExtension(base, fileSet) {
  for (const [from, to] of JS_TO_TS_SUFFIXES) {
    if (!base.endsWith(from)) continue;
    const candidate = `${base.slice(0, -from.length)}${to}`;
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
    const base = `src/lib/${clean.slice("$lib/".length)}`;
    return resolveCandidate(base, fileSet) ?? resolveEmittedExtension(base, fileSet);
  }
  if (!clean.startsWith("./") && !clean.startsWith("../")) return null;

  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), clean));
  return resolveCandidate(base, fileSet) ?? resolveEmittedExtension(base, fileSet);
}

function isRelativeSpecifier(specifier) {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

/**
 * Specifiers that are meant to point into the scanned tree — the ones whose
 * failure to resolve means a dropped edge rather than a package or an asset.
 */
function isGraphSpecifier(specifier) {
  return isRelativeSpecifier(specifier) || specifier.startsWith("$lib/");
}

/**
 * The tree-relative path a specifier aims at, before resolution. Used to tell
 * "a file we failed to find" (`src/…`) from "deliberately outside" (`../server
 * -headers.js`, an asset, a package).
 */
export function specifierTarget(specifier, fromFile) {
  const clean = specifier.split(/[?#]/)[0];
  if (clean.startsWith("$lib/")) return `src/lib/${clean.slice("$lib/".length)}`;
  return path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), clean));
}

/**
 * True when an unresolved specifier aims at a scanned module inside the tree —
 * i.e. a dropped edge, the one failure mode a cycle graph must not have.
 *
 * Only module-shaped paths qualify. `./icon.svg?raw` and `./styles.css` are
 * assets: they are not modules, so failing to find them in the file set is
 * correct and says nothing about the graph.
 */
export function isInTreeSpecifier(specifier, fromFile) {
  if (!isGraphSpecifier(specifier)) return false;
  const clean = specifier.split(/[?#]/)[0];
  const hasExtension = /\.[a-z0-9]+$/i.test(clean);
  if (hasExtension && !/\.(ts|mts|js|mjs|svelte)$/.test(clean)) return false;
  return specifierTarget(specifier, fromFile).startsWith("src/");
}

/* ---------------------------------------------------------------- sources */

export const DEFAULT_EXCLUDE = Object.freeze([
  /^src\/tests\//,
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
  sources.sort((a, b) => byCodeUnit(a.path, b.path));
  return sources;
}

/* ------------------------------------------------------------------ graph */

/**
 * Two adjacency maps over the same node set: `static` (load-order) and
 * `lazy` (only `import()`). The union is built where it is needed.
 */
export function buildImportGraph(sources) {
  const fileSet = new Set(sources.map((entry) => entry.path));
  const staticEdges = new Map();
  const lazyEdges = new Map();
  const unresolved = [];
  const computed = [];

  for (const { path: file, source } of sources) {
    const { staticSpecifiers, lazySpecifiers, computedSpecifiers } = extractSpecifiers(file, source);
    const staticTargets = new Set();
    const lazyTargets = new Set();

    for (const specifier of staticSpecifiers) {
      const target = resolveSpecifier(file, specifier, fileSet);
      if (target && target !== file) staticTargets.add(target);
      else if (!target && isGraphSpecifier(specifier)) {
        unresolved.push({ from: file, specifier, kind: "static" });
      }
    }

    for (const specifier of lazySpecifiers) {
      const target = resolveSpecifier(file, specifier, fileSet);
      if (target && target !== file) lazyTargets.add(target);
      else if (!target && isGraphSpecifier(specifier)) {
        unresolved.push({ from: file, specifier, kind: "lazy" });
      }
    }

    for (const specifier of computedSpecifiers) {
      computed.push({ from: file, specifier });
    }

    staticEdges.set(file, [...staticTargets].sort(byCodeUnit));
    lazyEdges.set(file, [...lazyTargets].sort(byCodeUnit));
  }

  return {
    files: sources.map((entry) => entry.path),
    staticEdges,
    lazyEdges,
    unresolved,
    computed,
  };
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

  return Object.fromEntries([...counts.entries()].sort((a, b) => byCodeUnit(a[0], b[0])));
}

/** Only the pairs that cross a boundary against the target chain. */
export function uphillPairs(layerPairs) {
  return Object.fromEntries(
    Object.entries(layerPairs).filter(([pair]) => {
      const [from, to] = pair.split("->");
      return isUphill(from, to);
    }),
  );
}

/** Layers present in one SCC, largest first — the report's "what is inside". */
function layerBreakdown(members) {
  const counts = new Map();
  for (const member of members) {
    const layer = layerOf(member);
    counts.set(layer, (counts.get(layer) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || byCodeUnit(a[0], b[0]))
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
    .sort((a, b) => b.size - a.size || byCodeUnit(a.sample, b.sample));
}

/* ---------------------------------------------------------------- analyse */

export function analyse(sources) {
  const graph = buildImportGraph(sources);
  const combined = mergeAdjacency(graph.files, graph.staticEdges, graph.lazyEdges);

  const staticPairs = layerPairCounts(graph.staticEdges);
  const lazyPairs = layerPairCounts(graph.lazyEdges);

  return {
    fileCount: graph.files.length,
    staticEdgeCount: countEdges(graph.staticEdges),
    lazyEdgeCount: countEdges(graph.lazyEdges),
    static: {
      sccs: describeCycles(graph.files, graph.staticEdges),
      layerPairs: staticPairs,
      uphillPairs: uphillPairs(staticPairs),
    },
    lazy: {
      layerPairs: lazyPairs,
      uphillPairs: uphillPairs(lazyPairs),
    },
    combined: {
      sccs: describeCycles(graph.files, combined),
    },
    unresolved: graph.unresolved,
    computedLazy: graph.computed,
  };
}

/* --------------------------------------------------------------- baseline */

/** The persisted shape: sizes plus one stable anchor per SCC, nothing else. */
export function toBaseline(result) {
  const cycles = (group) => group.sccs.map(({ size, sample }) => ({ size, sample }));

  return {
    note:
      "Burn-down only. Regenerate with `npm run check:cycles -- --update-baseline`, which refuses " +
      "to raise a value and refuses every cycle change. `static` counts value imports, `combined` " +
      "adds runtime import(), and only uphill layer pairs are frozen — see the header of " +
      "scripts/arch-cycles.mjs for why.",
    static: { sccs: cycles(result.static), uphillPairs: { ...result.static.uphillPairs } },
    lazy: { uphillPairs: { ...result.lazy.uphillPairs } },
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

function compareUphillPairs(current, baseline, label, failures, improvements) {
  for (const [pair, count] of Object.entries(current)) {
    const allowed = baseline?.[pair];
    if (allowed === undefined) {
      failures.push(
        `[${label}] new uphill import pair ${pair} (${count} edges) — this is the direction the layering forbids`,
      );
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
 * Only uphill pairs are compared. A downhill import is what the layering asks
 * for, and freezing its count would make every feature PR edit the baseline —
 * which in this repository means a merge conflict in a generated file, not a
 * decision. The direction that is a violation is the one that is ratcheted.
 *
 * Improvements are reported separately: they never fail the gate, but a PR that
 * removes a cycle or an uphill edge is expected to lower the baseline in the
 * same change, which is what keeps the numbers meaningful.
 */
export function compareToBaseline(result, baseline) {
  const failures = [];
  const improvements = [];

  if (result.fileCount === 0 || result.staticEdgeCount === 0) {
    failures.push("the analyser found no files or no static edges — a graph that empty proves nothing");
  }

  // A specifier that points into `src/` and resolves to no scanned module is a
  // dropped edge, not a package and not an asset. Left as a warning it would
  // let a cycle form invisibly: the graph would simply be missing a link.
  for (const { from, specifier, kind } of result.unresolved ?? []) {
    if (!isInTreeSpecifier(specifier, from)) continue;
    failures.push(
      `[graph] ${from} has a ${kind ?? "static"} import "${specifier}" that points into src/ ` +
        `but matches no scanned module — the edge is missing from the graph`,
    );
  }

  compareCycles(result.static.sccs, baseline.static?.sccs, "static", failures, improvements);
  compareUphillPairs(result.static.uphillPairs, baseline.static?.uphillPairs, "static", failures, improvements);
  compareCycles(result.combined.sccs, baseline.combined?.sccs, "combined", failures, improvements);
  compareUphillPairs(result.lazy.uphillPairs, baseline.lazy?.uphillPairs, "lazy", failures, improvements);

  return { failures, improvements };
}

/**
 * What the CLI should do, without doing it — so the refusal path is testable
 * without touching the filesystem. `main` performs the action; nothing else
 * decides whether a write is allowed.
 */
export function decide({ result, baseline, wantsInit, wantsUpdate }) {
  if (wantsInit) {
    if (baseline) return { action: "refuse", failures: ["a baseline already exists — use --update-baseline"] };
    return { action: "write", failures: [], improvements: [] };
  }

  if (!baseline) {
    return { action: "error", failures: ["no baseline yet — run with --init once"], improvements: [] };
  }

  const { failures, improvements } = compareToBaseline(result, baseline);

  if (wantsUpdate) {
    if (failures.length > 0) return { action: "refuse", failures, improvements };
    return { action: "write", failures, improvements };
  }

  return { action: failures.length > 0 ? "fail" : "pass", failures, improvements };
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
  const entries = Object.entries(pairs).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return;
  console.log(`\n${title}:`);
  for (const [pair, count] of entries) console.log(`  ${pair.padEnd(26)} ${count}`);
}

function printReport(result) {
  console.log(
    `Import graph: ${result.fileCount} modules, ${result.staticEdgeCount} static value edges, ` +
      `${result.lazyEdgeCount} runtime import() edges.`,
  );

  printCycles("Load-order cycles (static value imports)", result.static.sccs);
  printCycles("Dependency cycles (static + lazy)", result.combined.sccs);
  printUphill(result.static.uphillPairs, "Uphill static import pairs (gated)");
  printUphill(result.lazy.uphillPairs, "Uphill lazy import pairs (gated)");

  if (result.unresolved.length > 0) {
    const dropped = result.unresolved.filter(({ from, specifier }) => isInTreeSpecifier(specifier, from));
    const external = result.unresolved.length - dropped.length;

    if (dropped.length > 0) {
      console.log(`\nUnresolved in-tree imports (${dropped.length}) — dropped edges, these fail the gate:`);
      for (const { from, specifier, kind } of dropped) {
        console.log(`  ${from} -> ${specifier} (${kind})`);
      }
    }
    if (external > 0) {
      console.log(
        `\nUnresolved non-module specifiers (${external}) — assets, JSON, CSS and files outside ` +
          `src/, informational only:`,
      );
      for (const { from, specifier } of result.unresolved.filter(
        (entry) => !isInTreeSpecifier(entry.specifier, entry.from),
      ).slice(0, 6)) {
        console.log(`  ${from} -> ${specifier}`);
      }
    }
  }

  if (result.computedLazy.length > 0) {
    console.log(
      `\nComputed import() specifiers (${result.computedLazy.length}) — not resolvable statically, ` +
        `so not in the graph. Kept visible on purpose:`,
    );
    for (const { from, specifier } of result.computedLazy.slice(0, 6)) {
      console.log(`  ${from} -> ${specifier}`);
    }
  }
}

function main(argv) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const baselinePath = path.join(repoRoot, "scripts", "arch-cycles.baseline.json");
  const wantsUpdate = argv.includes("--update-baseline");
  const wantsInit = argv.includes("--init");
  const wantsJson = argv.includes("--json");

  const result = analyse(readSources(path.join(repoRoot, "src")));

  if (wantsJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  printReport(result);

  const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")) : null;
  const outcome = decide({ result, baseline, wantsInit, wantsUpdate });

  if (outcome.improvements?.length > 0) {
    console.log("\nLower the baseline (improvements, not failures):");
    for (const improvement of outcome.improvements) console.log(`  · ${improvement}`);
  }

  if (outcome.action === "write") {
    writeFileSync(baselinePath, `${JSON.stringify(toBaseline(result), null, 2)}\n`);
    console.log(`\n✅ baseline written: ${path.relative(repoRoot, baselinePath)}`);
    return;
  }

  if (outcome.action === "refuse") {
    console.error("\n❌ refusing to write the baseline:");
    for (const failure of outcome.failures) console.error(`   - ${failure}`);
    console.error("\nA ratchet that can be raised is not a ratchet. Fix the regression instead.");
    process.exit(1);
  }

  if (outcome.action === "error") {
    for (const failure of outcome.failures) console.error(`❌ ${failure}`);
    process.exit(1);
  }

  if (outcome.action === "fail") {
    console.error(`\n❌ ${outcome.failures.length} regression(s) against the baseline:`);
    for (const failure of outcome.failures) console.error(`  - ${failure}`);
    process.exit(1);
  }

  console.log("\n✅ no regression against the baseline.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
