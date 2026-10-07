/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import adapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";
import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { defineConfig, configDefaults } from "vitest/config";
// `loadEnv` is not re-exported by vitest/config, so it comes from vite itself.
import { loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { cspDirectives } from "./src/config/cspDirectives.ts";

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

// Multi-agent machines run several worktrees at once; each Vitest run defaults
// to cpus-1 workers and together they saturate every core. To keep the host system
// fully responsive, avoid thermal throttling, and prevent UI freezes, Vitest defaults
// to max 2 workers locally unless explicitly overridden by VITEST_MAX_WORKERS.
// In CI environments (CI=true), Vitest uses its default sizing.
const maxWorkers = (() => {
  const raw = process.env.VITEST_MAX_WORKERS;
  if (raw) {
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new Error(`Invalid VITEST_MAX_WORKERS="${raw}" — use a positive integer.`);
    }
    return parsed;
  }
  if (process.env.CI) return undefined;
  return 2;
})();

const VITEST_EXCLUDE = [
  ...configDefaults.exclude,
  // Both hold git worktrees, and AGENTS.md tells every agent to make one before
  // starting work — so on any active machine these contain several full copies
  // of the repo. Without this, a run in the main checkout collects every
  // worktree's tests too: a `*.component.test.ts` from a sibling branch gets
  // picked up by the `unit` project, where `svelte` resolves to its server
  // build and `mount()` throws, and a single run reported 222 failures that
  // belonged to nobody's change. A suite that is red for reasons unrelated to
  // your work is a suite people stop reading.
  ".claude/**",
  ".worktrees/**",
  // Playwright specs must only run via `npm run test:e2e`, not Vitest
  "tests/e2e/**",
  // The WebGPU parity suite needs a real browser adapter: `npm run test:gpu`.
  "tests/gpu/**",
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
  // Tests do not need the full SvelteKit plugin: it generates the route
  // manifest and resolves hooks, which unit tests never touch, and its SSR
  // machinery dominates Vitest's transform/import time. Under Vitest the
  // lightweight `svelte()` plugin (which still compiles `.svelte` / `.svelte.ts`)
  // is used instead, and the `$app/*` / `$env/*` virtual modules it normally
  // provides are aliased to small stand-ins in `src/tests/helpers/`.
  // Dev/build/check keep `sveltekit()`. Preprocessing is passed explicitly to
  // both plugins: since SvelteKit 3 there is no `svelte.config.js` anymore.
  //
  // One thing `sveltekit()` did for free was run `svelte-kit sync` on startup,
  // generating the `$app` types package, which `tsconfig.json` extends.
  // Without it, rolldown's resolver (used during dependency optimization) fails
  // on a fresh checkout/CI with "Tsconfig not found" — so the test branch syncs
  // once, only when the generated package is missing.
  plugins: [
    process.env.VITEST === "true"
      ? [
          {
            name: "cachy-ensure-svelte-kit-sync",
            config() {
              // Guard against re-entry: `svelte-kit sync` itself loads this
              // config, so an unguarded marker check would fork-bomb nested
              // sync processes (each level waiting on the next).
              if (
                !process.env.CACHY_SYNCING &&
                !existsSync("node_modules/$app/tsconfig.json")
              ) {
                execSync("svelte-kit sync", {
                  stdio: "inherit",
                  env: { ...process.env, CACHY_SYNCING: "1" },
                });
              }
            },
          },
          svelte({ preprocess: vitePreprocess() }),
        ]
      : sveltekit({
          preprocess: vitePreprocess(),
          adapter: adapter(),
          // Build-time origin for CSRF checks and `event.url` behind a
          // reverse proxy (replaces adapter-node's removed ORIGIN variable —
          // see DEPLOYMENT.md §7). Unset (e.g. CI builds) falls back to the
          // request-derived origin via host headers.
          // SvelteKit 3 reads ORIGIN at BUILD time, but Vite never merges .env
          // files into `process.env` — only `loadEnv()` does. Our deploy flow
          // copies `.env` into the shadow build dir and runs `npm run build`
          // without exporting it, so without this call ORIGIN would silently
          // stay unset and the canonical CSRF origin would degrade to the Host
          // request header.
          paths: {
            ...(() => {
              const origin =
                process.env.ORIGIN ??
                loadEnv(process.env.NODE_ENV ?? "production", process.cwd(), "ORIGIN").ORIGIN;
              return origin ? { origin } : {};
            })(),
          },
          csp: {
            mode: "auto",
            directives: cspDirectives,
          },
        }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "$app/env": fileURLToPath(new URL("./src/tests/helpers/app-environment.ts", import.meta.url)),
      "$env/dynamic/private": fileURLToPath(new URL("./src/tests/helpers/dynamic-private-env.ts", import.meta.url)),
      "#lib": fileURLToPath(new URL("./src/lib", import.meta.url)),
    },
  },
  test: {
    // The suite runs pure-logic tests by default. Spinning up a DOM per file
    // was the dominant cost (environment + setup accounted for ~400s of CPU on
    // a full run). Files that genuinely need a DOM opt in per-file with
    // `// @vitest-environment happy-dom` (or jsdom); per-file directives win
    // over this default. Pure-logic files already annotated `node` stay as-is.
    testTimeout: 20000,
    hookTimeout: 20000,
    // Vitest 5 flipped this to `true`. That is a behavioural change across the
    // whole suite, not a version bump: a mock recorded in `beforeAll` or in a
    // setup file loses its call history before the test that asserts on it, so
    // such a test keeps passing until the day someone adds an assertion.
    // Pin the old default for the upgrade; adopting the new one is its own
    // change, to be made when the suite can actually be run (FEAT-0630).
    clearMocks: false,
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    pool: "threads",
    maxWorkers, // VITEST_MAX_WORKERS cap — see note above
    minWorkers: 1,
    // Two projects, because component tests need one resolution rule the rest
    // of the suite must not have. `npm test` runs both.
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          env: { VITEST_BROWSER: "false" },
          exclude: [...VITEST_EXCLUDE, COMPONENT_TESTS],
        },
      },
      {
        // Mounting a component needs `svelte` resolved to its browser build;
        // its server entry throws `lifecycle_function_unavailable` from
        // `mount()`. Setting that condition globally is not free — it also
        // flips `$app/env`'s `browser` to true, which sent
        // technicalsService down its Worker path and broke two passing tests.
        // So it lives here, scoped to the files that need it.
        extends: true,
        resolve: { conditions: ["browser"] },
        test: {
          name: "components",
          env: { VITEST_BROWSER: "true" },
          include: [COMPONENT_TESTS],
          // Vitest derives a benchmark project from every *visible* inline
          // project (`<name> (bench)`) and collects `benchmark.include` into it
          // regardless of that project's own `include`. So `components` ran all
          // 17 benchmarks a second time under `resolve.conditions: ["browser"]`
          // and they died on `window is not defined` and `mount()` — none of
          // them match `src/**/*.component.test.ts` (BUG-0631).
          //
          // `benchmark.enabled: false` does not stop it: `vitest bench` forces
          // benchmark projects on and the expansion sets `enabled: true` on the
          // derived project regardless. `hidden` does — the expansion skips
          // hidden entries, and a project marked hidden is still matched by
          // `--project=components` and by `npm test`.
          hidden: true,
          // Component tests translate via svelte-i18n; wait for the active
          // dictionary so mounts never assert against raw $keys (FEAT-0259).
          setupFiles: ["./vitest.setup.ts", "./vitest.i18n-setup.ts"],
        },
      },
    ],
    benchmark: {
      // Without an `include`, Vitest builds one benchmark project per inline
      // project — `unit (bench)` and `components (bench)` — and each of them
      // collects every `*.bench.ts` regardless of that test project's own
      // `include`. So the suite below ran twice, and the `components` copy died
      // on `window is not defined`, `mount() is not available on the server` and
      // the browser `resolve.conditions` (BUG-0631). Listing the files makes
      // the set explicit and keeps `components` out of benchmark collection
      // entirely: none of these files match `src/**/*.component.test.ts`, so
      // that project has nothing left to run.
      include: [
        "src/benchmarks/daily_perf_technicals.bench.ts",
        "src/benchmarks/indicator_clone.bench.ts",
        "src/benchmarks/indicator_perf.bench.ts",
        "src/services/marketWatcher.bench.ts",
        "src/tests/closeAllPositions.bench.ts",
        "src/tests/performance/news_slice.bench.ts",
        "src/tests/performance/technicals_cache.bench.ts",
        "tests/benchmarks/market_dedup.bench.ts",
        "tests/benchmarks/market_updates.bench.ts",
        "tests/benchmarks/marketWatcher_fillGaps.bench.ts",
        "tests/benchmarks/rolling_stats.bench.ts",
        "tests/benchmarks/saveJournal.bench.ts",
        "tests/benchmarks/stats_calc.bench.ts",
        "tests/benchmarks/storage.bench.ts",
        "tests/benchmarks/technicals_prep.bench.ts",
        "tests/benchmarks/toNumFast.bench.ts",
        "tests/benchmarks/wasm_parity.bench.ts",
      ],
      // Vitest collects every `*.bench.ts` file as a benchmark file, and a
      // benchmark file without tests is an error: "No test suite found in
      // file". The files below match the glob but are standalone scripts
      // with hand-rolled `performance.now()` timing, not Vitest benchmarks —
      // one calls `process.exit(1)`, one encodes a precision assertion.
      // `npx tsx` still reaches them.
      exclude: [
        // Needs a device key derived from real session state, and its two
        // sequential PBKDF2 benchmarks each run past 300 s — measured, not
        // estimated. Doubled by the per-project collection that below, that is
        // over twenty minutes in a command meant to be run routinely. Kept for
        // manual measurement: vitest bench src/benchmarks/crypto_loop.bench.ts
        // --testTimeout 900000
        "src/benchmarks/crypto_loop.bench.ts",
        "tests/benchmarks/kline_string_optimization.bench.ts",
        "tests/benchmarks/mfi_optimization.bench.ts",
        "tests/benchmarks/patternDetection.bench.ts",
        "tests/benchmarks/safeJson.bench.ts",
        "tests/benchmarks/slidingWindow.bench.ts",
        "tests/benchmarks/stochrsi.bench.ts",
        "tests/benchmarks/technicals.bench.ts",
        "tests/benchmarks/worker_simulation.bench.ts",
        "tests/benchmarks/wma_optimization.bench.ts",
      ],
    },
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
    },
    chunkSizeWarningLimit: 1000,
  },
  // Vendor chunking is client-build-only, and only outside Vitest (which
  // manages its own environments and would choke on a stray `client` key):
  // the SSR bundle is re-bundled by adapter-node 6 (which breaks when its
  // entry chunk is renamed), and the service-worker environment builds with
  // codeSplitting disabled, where chunking options are a hard error.
  ...(process.env.VITEST === "true"
    ? {}
    : {
        environments: {
          client: {
            build: {
              // NOTE: `rolldownOptions`, not `rollupOptions` — per-environment
              // config only honours the new key; the old one is silently
              // ignored (verified: no vendor chunks emitted with it).
              rolldownOptions: {
                output: {
                  // Vendor chunking must be expressed as `codeSplitting.groups`,
                  // not `manualChunks`: Kit sets `output.codeSplitting`
                  // itself, and rolldown ignores `manualChunks` whenever
                  // `codeSplitting` is specified (WARN in the client build).
                  // Groups merge with Kit's own `sveltekit-manifest` group.
                  codeSplitting: {
                    // Every vendor group is pinned to `node_modules/<pkg>/`.
                    // Bare package-name regexes also match first-party paths —
                    // `/three/` alone swallowed `src/lib/three/*` and
                    // `ThreeBackground.svelte` into `three-vendor`.
                    groups: [
                      {
                        name: "three-vendor",
                        test: /node_modules[\\/]three[\\/]/,
                      },
                      {
                        name: "chart-vendor",
                        test: /node_modules[\\/](chart\.js|chartjs-[^\\/]+)[\\/]/,
                      },
                      {
                        name: "markdown-vendor",
                        test: /node_modules[\\/](katex|marked|marked-katex-extension)[\\/]/,
                      },
                      {
                        name: "ai-vendor",
                        test: /node_modules[\\/](@google[\\/]generative-ai|openai)[\\/]/,
                      },
                      {
                        name: "i18n-vendor",
                        test: /node_modules[\\/](svelte-i18n|intl-messageformat)[\\/]/,
                      },
                      {
                        name: "dompurify-vendor",
                        test: /node_modules[\\/]dompurify[\\/]/,
                      },
                      {
                        name: "zod-vendor",
                        test: /node_modules[\\/]zod[\\/]/,
                      },
                      {
                        name: "lodash-vendor",
                        test: /node_modules[\\/]lodash-es[\\/]/,
                      },
                      {
                        name: "charts-vendor",
                        test: /node_modules[\\/]lightweight-charts[\\/]/,
                      },
                      {
                        name: "spacetimedb-vendor",
                        test: /node_modules[\\/]spacetimedb[\\/]/,
                      },
                      // Catch-all for the rest of node_modules — except the
                      // Kit client runtime: grouping entry.js together with
                      // its dynamic import client-entry.js would erase the
                      // edge Kit uses to locate the runtime chunk
                      // ("Could not find the client runtime chunk").
                      {
                        name: "vendor",
                        test: /node_modules\/(?!@sveltejs\/kit\/src\/runtime)/,
                      },
                      // Production Hardening: Split Shaders and WASM into dedicated chunks
                      { name: "gpu-shaders", test: /shaders\/.*\.wgsl/ },
                      {
                        name: "wasm-engine",
                        test: /technicals-wasm|\.wasm/,
                      },
                    ],
                  },
              },
            },
          },
        },
      }}),
});
