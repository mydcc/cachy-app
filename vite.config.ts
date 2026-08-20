/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { readFileSync } from "node:fs";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig, configDefaults } from "vitest/config";
import tailwindcss from "@tailwindcss/vite";

// Single source of truth for the app version: the `version` field in
// package.json, which semantic-release bumps on every release.
// Read the file directly instead of relying on `process.env.npm_package_version`
// — that variable is only set when Vite runs through an npm script, and it
// silently injected `undefined` when invoked any other way.
const { version: appVersion } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf-8"),
) as { version: string };

/** Test files that mount a Svelte component. See the `components` project below. */
const COMPONENT_TESTS = "src/**/*.component.test.ts";

const VITEST_EXCLUDE = [
  ...configDefaults.exclude,
  ".claude/**",
  // Playwright specs must only run via `npm run test:e2e`, not Vitest
  "tests/e2e/**",
  // Benchmarks that assert wall-clock time or heap growth. They are useful
  // signals but cannot be pass/fail gates: on a shared CI runner a single GC
  // pause moves the result more than any real regression would. The scaling
  // check compares a ~5ms measurement against a ~24ms one, so ±3ms of noise
  // swings the ratio by 60% — it measured the runner, not the algorithm, and
  // failed CI at 10.9x against a threshold of 8 while passing locally at 4.4x.
  // Run them deliberately with `npm run test:perf`; CI runs them in a
  // non-blocking job so the numbers stay visible.
  "src/services/engineBenchmark.test.ts",
  "src/benchmarks/marketWatcher_backfill.test.ts",
  "tests/benchmarks/syncService_perf.test.ts",
  "src/tests/performance/memory_profiling.test.ts",
  "src/tests/performance/dataRepairService_benchmark.test.ts",
  "src/tests/performance/startup_benchmark.test.ts",
];

export default defineConfig({
  plugins: [sveltekit(), tailwindcss()],
  test: {
    // Most of the suite exercises browser-facing code (localStorage, window),
    // but no default environment was configured, so those files failed to load
    // under the implicit `node` default. Individual files can still opt out
    // with `// @vitest-environment node`, and the 12 files that already declare
    // jsdom or happy-dom keep their own choice — per-file directives win.
    testTimeout: 20000,
    hookTimeout: 20000,
    environment: "happy-dom",
    setupFiles: ["./vitest.setup.ts"],
    pool: "threads",
    // Two projects, because component tests need one resolution rule the rest
    // of the suite must not have. `npm test` runs both.
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          exclude: [...VITEST_EXCLUDE, COMPONENT_TESTS],
        },
      },
      {
        // Mounting a component needs `svelte` resolved to its browser build;
        // its server entry throws `lifecycle_function_unavailable` from
        // `mount()`. Setting that condition globally is not free — it also
        // flips `$app/environment`'s `browser` to true, which sent
        // technicalsService down its Worker path and broke two passing tests.
        // So it lives here, scoped to the files that need it.
        extends: true,
        resolve: { conditions: ["browser"] },
        test: {
          name: "components",
          include: [COMPONENT_TESTS],
        },
      },
    ],
  },
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
  },
  optimizeDeps: {
    include: ["intl-messageformat"],
  },
  ssr: {
    noExternal: [
      "intl-messageformat",
      "@formatjs/icu-messageformat-parser",
      "@formatjs/icu-skeleton-parser",
      "@formatjs/fast-memoize",
      "svelte-i18n",
    ],
  },
  server: {
    fs: {
      allow: ['..']
    }
  },
  worker: {
    format: 'es',
    plugins: () => [tailwindcss()]
  },
  build: {
    rollupOptions: {
      external: ["openai"], 
      output: {
        manualChunks: (id) => {
          if (id.includes("node_modules")) {
            if (id.includes("three")) return "three-vendor";
            if (id.includes("chart.js") || id.includes("chartjs-")) return "chart-vendor";
            if (id.includes("katex") || id.includes("marked")) return "markdown-vendor";
            if (id.includes("@google/generative-ai") || id.includes("openai")) return "ai-vendor";
            if (id.includes("svelte-i18n") || id.includes("intl-messageformat")) return "i18n-vendor";
            if (id.includes("dompurify")) return "dompurify-vendor";
            if (id.includes("zod")) return "zod-vendor";
            if (id.includes("lodash-es")) return "lodash-vendor";
            if (id.includes("lightweight-charts")) return "charts-vendor";
            if (id.includes("spacetimedb")) return "spacetimedb-vendor";
            return "vendor";
          }
          // Production Hardening: Split Shaders and WASM into dedicated chunks
          if (id.includes('shaders/') && id.endsWith('.wgsl')) {
            return 'gpu-shaders';
          }
          if (id.includes('technicals-wasm') || id.includes('.wasm')) {
            return 'wasm-engine';
          }
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
});