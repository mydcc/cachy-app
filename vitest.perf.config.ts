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

import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig, { PERF_TESTS } from "./vite.config";

/**
 * Config for `npm run test:perf`.
 *
 * The benchmarks assert wall-clock time and heap growth. `vite.config.ts`
 * excludes them from `npm test` so a noisy CI runner cannot fail a pull request
 * on measurement jitter — but that exclusion would also hide them here, so this
 * config narrows the run to exactly `PERF_TESTS`.
 *
 * That narrowing happens **per project**, and that is the whole fix. Vitest
 * derives a project from every entry in `test.projects` and each brings its own
 * `include`/`exclude`; a top-level `test.include` is ignored once `projects` is
 * set. The previous version set one anyway, collected nothing from its list, and
 * ran the entire suite instead — 96 files and 745 tests. That is how a component
 * test unrelated to performance failed in the perf job on a pull request that
 * touched no code at all.
 */
const config = mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      pool: "forks",
      // memory_profiling.test.ts measures heap growth, which only means anything
      // if it can force a collection first. Without --expose-gc, `global.gc` is
      // undefined, the test's `if (global.gc)` guards did nothing, and it
      // compared two arbitrary points in V8's allocation cycle against a 10 MB
      // threshold — which is why CI reported 16 MB of "growth" with the
      // calculator unchanged. The test skips itself when the flag is absent
      // rather than reporting a verdict it cannot support.
      //
      // In vitest 4 this is a top-level test option; it is NOT read under
      // `poolOptions.<pool>.execArgv`, where it is silently ignored.
      execArgv: ["--expose-gc"],
    },
  }),
);

/**
 * Keep the unit project, drop the rest.
 *
 * The `components` project exists to mount Svelte components under
 * `resolve.conditions: ["browser"]`. No benchmark needs it, and leaving it in
 * would collect component tests again — the failure being fixed.
 */
type Project = { test?: { name?: string; include?: string[]; exclude?: string[] } };
const projects = (config.test?.projects ?? []) as Project[];
config.test!.projects = projects.filter((p) => p.test?.name === "unit");

const unit = config.test!.projects![0];
unit.test ??= {};
unit.test.include = [...PERF_TESTS];
// Not the base `VITEST_EXCLUDE`: that list contains `PERF_TESTS` itself, and a
// file that is both included and excluded is collected by neither. Only the
// paths that keep a worktree's copies out of the run belong here.
unit.test.exclude = ["**/node_modules/**", "**/.git/**", ".claude/**", ".worktrees/**"];

// mergeConfig concatenates arrays rather than replacing them, so this has to be
// an overwrite after the merge — `exclude: []` would append to the base list
// instead of clearing it, leaving every file both included and excluded.
config.test!.exclude = ["**/node_modules/**", "**/.git/**", ".claude/**", ".worktrees/**"];

export default config;