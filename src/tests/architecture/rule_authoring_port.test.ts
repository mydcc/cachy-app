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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

// @vitest-environment node

/*
 * FEAT-0817, ADR-0030 decision 8 — the model stays out of the evaluation loop
 * by construction.
 *
 * ## Why this test exists and the cycle ratchet does not cover it
 *
 * ADR-0030 decision 8 names `scripts/arch-cycles.mjs` and
 * `scripts/arch-baseline-guard.mjs` as the proof. They are not, and the reason
 * is worth writing down so nobody deletes this file believing they are:
 *
 * The ratchet freezes two things — the mass of strongly connected components,
 * and the count of *uphill* layer pairs, where uphill means an import against
 * the `components < stores < services < lib < utils` chain. An import from
 * `src/services/alertEngine/` into `src/lib/ai/ruleAuthoring/` is
 * `services -> lib`, which is **downhill**: exactly the direction the layering
 * asks for, and one the ratchet deliberately does not freeze (freezing it
 * would make every feature PR edit the baseline). An import from
 * `src/lib/rules/` is `lib -> lib`, same layer, which the ratchet does not
 * measure at all.
 *
 * So both forbidden imports would leave every frozen number unchanged. The
 * ratchet stays green here — the port adds no uphill edge and no cycle, which
 * the second half of this file checks — but the boundary itself needs its own
 * assertion, and this is it.
 *
 * ## The detector is exercised, not trusted
 *
 * A path matcher that silently stopped matching would make this file pass
 * vacuously, which is worse than no test: the guard would look real. So the
 * matcher runs against synthetic violating, type-only and clean sources in the
 * same run.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

/** The port nothing on the evaluation path may reach. */
const PORT_SEGMENT = "ruleAuthoring";

/**
 * The trees ADR-0030 decision 8 names: the rule language and the engine that
 * evaluates it.
 */
const FORBIDDEN_IMPORTERS = [
  "src/lib/rules",
  "src/services/alertEngine",
] as const;

/** Where the port lives, so the second half can check its own imports. */
const PORT_DIR = "src/lib/ai/ruleAuthoring";

const SOURCE_EXTENSIONS = [".ts", ".svelte"];

function sourceFilesUnder(relativeDir: string): string[] {
  const absolute = path.join(REPO_ROOT, relativeDir);
  const found: string[] = [];

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!SOURCE_EXTENSIONS.some((ext) => entry.endsWith(ext))) continue;
      found.push(path.relative(REPO_ROOT, full).split(path.sep).join("/"));
    }
  };

  walk(absolute);
  return found;
}

/**
 * Every module specifier in `source`, whether the import is value or type.
 *
 * Both are collected deliberately. Only a value import creates a runtime path,
 * so only a value import could put a model call on the evaluation path — but a
 * type import means the engine has started to know the authoring vocabulary,
 * and that is the state from which the value import follows. ADR-0030 decision
 * 8 is written as an absolute ("must not import"), and the cheap reading is
 * the one to keep.
 */
function importedSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /\bimport\s+(?:type\s+)?[^;'"]*?from\s*["']([^"']+)["']/g,
    /\bexport\s+(?:type\s+)?[^;'"]*?from\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\s+["']([^"']+)["']/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]) specifiers.push(match[1]);
    }
  }
  return specifiers;
}

/** True when a specifier names a path segment, ignoring a query or hash. */
function hasSegment(specifier: string, segment: string): boolean {
  return specifier.split(/[?#]/)[0].split("/").includes(segment);
}

describe("the authoring port is unreachable from the evaluation path", () => {
  it("detects a value import, a type import and leaves a clean file alone", () => {
    // The matcher, exercised. Without this the two assertions below could pass
    // because the detector broke rather than because the tree is clean.
    const violating = `import { requestRuleDraft } from "../ai/ruleAuthoring/requestRuleDraft";`;
    const typeOnly = `import type { AuthoringDraft } from "../ai/ruleAuthoring/draftAnswer";`;
    const lazy = `const mod = await import("../ai/ruleAuthoring/requestRuleDraft");`;
    const clean = `import { ruleSchema } from "../rules/ruleSchema";`;
    const nearMiss = `import x from "../ai/ruleAuthoringHelpers";`;

    for (const source of [violating, typeOnly, lazy]) {
      expect(
        importedSpecifiers(source).some((s) => hasSegment(s, PORT_SEGMENT)),
      ).toBe(true);
    }
    for (const source of [clean, nearMiss]) {
      expect(
        importedSpecifiers(source).some((s) => hasSegment(s, PORT_SEGMENT)),
      ).toBe(false);
    }
  });

  it.each(FORBIDDEN_IMPORTERS)("%s does not import the port", (dir) => {
    const files = sourceFilesUnder(dir);
    // A directory that stopped existing, or a walker that returned nothing,
    // would make the loop below pass without checking anything.
    expect(files.length).toBeGreaterThan(0);

    const offenders = files.filter((file) =>
      importedSpecifiers(readFileSync(path.join(REPO_ROOT, file), "utf-8")).some(
        (specifier) => hasSegment(specifier, PORT_SEGMENT),
      ),
    );

    expect(offenders).toEqual([]);
  });

  it("the port imports no store and no service, so it adds no uphill edge", () => {
    // `src/lib/**` is layer `lib`; `stores` and `services` rank below it, so
    // either import would be uphill and would raise a frozen count in
    // `scripts/arch-cycles.baseline.json`. Checked here rather than left to
    // the ratchet, because the ratchet's message names a pair count and this
    // one names the file.
    const files = sourceFilesUnder(PORT_DIR).filter(
      (file) => !file.endsWith(".test.ts"),
    );
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of files) {
      const specifiers = importedSpecifiers(
        readFileSync(path.join(REPO_ROOT, file), "utf-8"),
      );
      for (const specifier of specifiers) {
        if (hasSegment(specifier, "stores") || hasSegment(specifier, "services")) {
          offenders.push(`${file} -> ${specifier}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
