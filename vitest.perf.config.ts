/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "./vite.config";

/**
 * Config for `npm run test:perf`.
 *
 * The benchmarks below assert wall-clock time and heap growth. vite.config.ts
 * excludes them from `npm test` so a noisy CI runner cannot fail a pull request
 * on measurement jitter — but that exclusion would also hide them here, so this
 * config re-includes exactly those files and clears the exclude list.
 *
 * Keep this list in sync with the exclusions in vite.config.ts.
 */
const config = mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: [
        "src/tests/performance/engine_benchmark.test.ts",
        "src/tests/performance/memory_profiling.test.ts",
        "src/tests/performance/dataRepairService_benchmark.test.ts",
        "src/tests/performance/startup_benchmark.test.ts",
      ],
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

// mergeConfig concatenates arrays rather than replacing them, so passing
// `exclude: []` above would have appended to the base exclusions instead of
// clearing them — leaving every file both included and excluded, and vitest
// reporting "No test files found". Overwrite it after the merge.
config.test!.exclude = ["**/node_modules/**", "**/.git/**"];

export default config;
