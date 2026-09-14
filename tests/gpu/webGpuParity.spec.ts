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

/**
 * FEAT-0439 — the WebGPU leg of FEAT-0028's cross-path parity.
 *
 * `crossPathParity.test.ts` holds WASM to the JS path. This holds the WebGPU
 * path to it, over the recorded 1000-candle BTCUSDT fixture FEAT-0438 commits,
 * because `technicalsService` hands the chart to `webGpuCalculator` whenever
 * the calculation strategy picks the GPU — and a chart that disagrees with the
 * evaluator lets a trader arm a rule against numbers the rule never sees.
 *
 * ## Layout
 *
 * - `parityCases.ts` runs in Chromium: every GPU method `calculate()` uses,
 *   next to the `JSIndicators` function the alert path uses.
 * - `f32Bound.ts` derives, per candle, how far single precision can move a
 *   value. No tolerance in this suite is a hand-picked number.
 * - This file, in Node, asserts — and names the candle when it cannot.
 *
 * Run with `npm run test:gpu`. No CI workflow runs Playwright today, so this is
 * a local and pre-release gate; `AGENTS.md` says so next to the verification
 * standard.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { build, type Plugin } from 'esbuild';

import type { CaseResult, ParityRun } from './parityCases';

const ROOT = process.cwd();
const SHADER_DIR = resolve(ROOT, 'src/shaders');
const FIXTURE = resolve(ROOT, 'src/services/__fixtures__/btcusdt-1h-recorded.json');

/** Any secure-context origin: `navigator.gpu` does not exist on `about:blank`. */
const ORIGIN = 'https://gpu-parity.test/';

/**
 * Where the GPU path is known to leave the JS path, and until which candle.
 *
 * An entry is a documented discrepancy, not a waiver. It is pinned to the last
 * candle that breaks the bound, so it fails the suite both when the divergence
 * grows past that candle and when it disappears — a fix has to delete the
 * entry, and a list of disagreements that outlives them reads as a GPU path
 * that cannot be trusted when it can.
 *
 * Empty since BUG-0475 started ATR, SuperTrend and the MACD signal on the
 * candle their input first has a value, which is where the JS path starts them.
 */
const KNOWN_DISCREPANCIES: Record<string, { lastDivergentCandle: number; cause: string }> = {};

/**
 * Cases whose GPU series must begin on the JS path's first candle, not merely
 * agree once both have values.
 *
 * The bound only compares candles where JS has a value, so a GPU stage that
 * seeds one candle early is invisible to it once the early seed has decayed.
 * BUG-0475 was that: ATR(14) seeded at candle 13, and SuperTrend and the MACD
 * signal ran over values that did not exist yet. The GPU writes 0 where it has
 * no value, so its first candle is its first non-zero one. The MACD line and
 * histogram are not listed: before their seed the GPU writes a bare fast EMA
 * there, a placeholder BUG-0475 leaves out of scope.
 */
const STARTS_WITH_JS = ['ATR(14)', 'SuperTrend(10,3)', 'MACD signal'];

/** No case may be settled by a handful of candles; the deepest warmup here is 33. */
const MIN_COMPARED_CANDLES = 900;

/** Vite's `?raw` imports, which esbuild does not know. */
const rawText: Plugin = {
  name: 'raw-text',
  setup(b) {
    b.onResolve({ filter: /\?raw$/ }, (args) => ({
      path: resolve(args.resolveDir, args.path.replace(/\?raw$/, '')),
      namespace: 'raw-text',
    }));
    b.onLoad({ filter: /.*/, namespace: 'raw-text' }, (args) => ({
      contents: readFileSync(args.path, 'utf8'),
      loader: 'text',
    }));
  },
};

async function bundleParityCases(): Promise<string> {
  const result = await build({
    entryPoints: [resolve(ROOT, 'tests/gpu/parityCases.ts')],
    bundle: true,
    format: 'iife',
    globalName: 'GpuParity',
    platform: 'browser',
    write: false,
    logLevel: 'silent',
    plugins: [rawText],
  });
  return result.outputFiles[0].text;
}

interface Divergence {
  candle: number;
  gpu: number | null;
  js: number;
  bound: number;
}

function divergences(result: CaseResult): { compared: number; beyond: Divergence[] } {
  let compared = 0;
  const beyond: Divergence[] = [];
  result.js.forEach((js, candle) => {
    if (js === null) return;
    compared++;
    const gpu = result.gpu[candle];
    const bound = result.bound[candle];
    if (bound === null) throw new Error(`${result.label}: no bound at candle ${candle} although the JS path has a value`);
    if (gpu === null || Math.abs(gpu - js) > bound) beyond.push({ candle, gpu, js, bound });
  });
  return { compared, beyond };
}

const describe = (d: Divergence): string =>
  `candle ${d.candle}: gpu ${d.gpu} vs js ${d.js}, |Δ| ${d.gpu === null ? 'n/a' : Math.abs(d.gpu - d.js).toPrecision(3)} > bound ${d.bound.toPrecision(3)}`;

let run: ParityRun;

test.describe('WebGPU ↔ JS indicator parity (FEAT-0439)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ browser }) => {
    const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8'));
    const script = await bundleParityCases();
    const page = await browser.newPage();
    try {
      await page.route(`${ORIGIN}**`, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>gpu parity</title>' }));
      await page.goto(ORIGIN);
      await page.addScriptTag({ content: script });
      run = await page.evaluate(
        (candles) => (window as unknown as { GpuParity: { runParity: (c: unknown) => Promise<ParityRun> } }).GpuParity.runParity(candles),
        fixture.candles,
      );
    } finally {
      await page.close();
    }
    // Not a skip. A green run with nothing compared is the failure this item
    // exists to prevent, so a machine without an adapter fails every test here.
    if (run.adapter === null) {
      throw new Error(
        'NOT RUN — no WebGPU adapter in this Chromium, so FEAT-0439 compared nothing. ' +
          'Headless Chromium normally provides SwiftShader; check that --enable-unsafe-webgpu reached the browser.',
      );
    }
    console.log(`[FEAT-0439] adapter: ${run.adapter}; ${run.results.length} cases`);
  });

  test('every WGSL compute shader is exercised by at least one case', () => {
    const shaders = readdirSync(SHADER_DIR)
      .filter((file) => file.endsWith('.wgsl'))
      .filter((file) => readFileSync(resolve(SHADER_DIR, file), 'utf8').includes('@compute'))
      .map((file) => basename(file, '.wgsl'));
    const exercised = new Set(run.results.flatMap((r) => r.shaders));

    expect(shaders.filter((s) => !exercised.has(s)), 'shaders without a parity case').toEqual([]);
    expect([...exercised].filter((s) => !shaders.includes(s)), 'cases naming a shader that does not exist').toEqual([]);
  });

  test('every documented discrepancy names a case that exists', () => {
    const labels = new Set(run.results.map((r) => r.label));
    expect(Object.keys(KNOWN_DISCREPANCIES).filter((label) => !labels.has(label))).toEqual([]);
  });

  test('every case compares enough candles to mean something', () => {
    for (const result of run.results) {
      const { compared } = divergences(result);
      expect(compared, `${result.label} compared ${compared} candles`).toBeGreaterThanOrEqual(MIN_COMPARED_CANDLES);
      expect(result.gpu.some((v) => v !== null && v !== 0), `${result.label}: the GPU returned nothing but zeros`).toBe(true);
    }
  });

  test('a seeded GPU series starts on the same candle as the JS series', () => {
    const firstGpu = (r: CaseResult) => r.gpu.findIndex((v) => v !== null && v !== 0);
    const firstJs = (r: CaseResult) => r.js.findIndex((v) => v !== null);
    const starts = STARTS_WITH_JS.map((label) => {
      const result = run.results.find((r) => r.label === label);
      if (!result) throw new Error(`STARTS_WITH_JS names ${label}, which is not a case`);
      return { label, gpu: firstGpu(result), js: firstJs(result) };
    });
    expect(starts.filter((s) => s.gpu !== s.js)).toEqual([]);
  });

  test('each GPU series stays within the f32 bound of the JS series', () => {
    const failures: string[] = [];
    for (const result of run.results) {
      const { beyond } = divergences(result);
      const known = KNOWN_DISCREPANCIES[result.label];

      if (!known) {
        if (beyond.length > 0) {
          failures.push(`${result.label}: ${beyond.length} candle(s) beyond the bound, first ${describe(beyond[0])}`);
        }
        continue;
      }

      const late = beyond.filter((d) => d.candle > known.lastDivergentCandle);
      if (late.length > 0) {
        failures.push(`${result.label}: diverges past its documented candle ${known.lastDivergentCandle}, first ${describe(late[0])}`);
      }
      const last = beyond.at(-1)?.candle;
      if (last !== known.lastDivergentCandle) {
        failures.push(
          `${result.label}: documented to diverge until candle ${known.lastDivergentCandle}, ` +
            (last === undefined ? 'but it stays within the bound everywhere — delete the entry' : `but the last divergent candle is ${last}`),
        );
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });
});
