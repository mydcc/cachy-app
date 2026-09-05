#!/usr/bin/env node
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
 * FEAT-0387 — the shadow run, offline.
 *
 * Runs both engines over the same candles and reports where they disagree:
 * the legacy `AlertEngineWasm` tick by tick, and the rule evaluator once per
 * candle close, exactly as `RuleEvaluationLoop` drives it. Both are the real
 * wasm modules the app loads.
 *
 * What this is: a measurement of the *behaviour change* the cutover makes, on
 * demand, with no waiting for an alarm to trigger in a live session.
 *
 * What this is not: proof that the live wiring works. It feeds candles
 * directly and never touches the market store or a websocket, so it cannot
 * see a subscription that never arrives. The integration test covers the
 * chain; a short live session with `startRuleEvaluationLoop(ledgerSink)` and
 * `compareShadowLedger()` covers the wiring. This covers the numbers.
 *
 * Usage:
 *   node scripts/shadow-run.mjs                       # synthetic candles
 *   node scripts/shadow-run.mjs --klines candles.json # real candles
 *   node scripts/shadow-run.mjs --threshold 50000 --symbol BTCUSDT
 *
 * A `--klines` file is a JSON array of `{ open, high, low, close, time }`,
 * the shape `/api/klines` returns and the market store stores.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MINUTE_MS = 60_000;
const START_MS = 1_757_030_400_000;

function parseArgs(argv) {
  const args = { symbol: "BTCUSDT", threshold: "50000.0", klines: undefined, timeframe: "1m" };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    const value = argv[i + 1];
    if (key && value !== undefined && key in args) args[key] = value;
  }
  return args;
}

/**
 * Candles with the two shapes the cutover is about:
 * a clean crossing (both engines should fire) and a spike that crosses
 * intra-candle and closes back below (only the tick engine can see it).
 */
function syntheticCandles(threshold) {
  const level = Number(threshold);
  const below = level - 1_000;
  const rows = [];
  const push = (i, o, h, l, c) =>
    rows.push({
      time: START_MS + i * MINUTE_MS,
      open: String(o),
      high: String(h),
      low: String(l),
      close: String(c),
    });

  push(0, below, below + 100, below - 100, below);
  push(1, below, below + 200, below - 100, below + 100);
  // Touch and recover: high pierces the level, close does not.
  push(2, below + 100, level + 500, below, below + 200);
  push(3, below + 200, below + 300, below, below + 150);
  // A clean crossing: the close is above the level.
  push(4, below + 150, level + 800, below + 100, level + 600);
  push(5, level + 600, level + 900, level + 400, level + 700);
  return rows;
}

/**
 * The ticks a candle produces, in the order a live feed would deliver them.
 *
 * open → high → low → close is the usual reconstruction. It is an
 * approximation of intra-candle order, and the report says so: the count of
 * legacy-only firings depends on it, the count of rule firings does not.
 */
function ticksOf(candle) {
  return [candle.open, candle.high, candle.low, candle.close];
}

async function loadCore() {
  const jsUrl = pathToFileURL(resolve(process.cwd(), "static/wasm/technicals_wasm.js")).href;
  const binary = resolve(process.cwd(), "static/wasm/technicals_wasm_bg.wasm");
  const mod = await import(jsUrl);
  await mod.default(readFileSync(binary));
  return mod;
}

function runLegacy(core, args, candles) {
  const engine = new core.AlertEngineWasm();
  const alert = {
    id: "a1",
    symbol: args.symbol,
    condition: { price_reached: args.threshold },
    active: true,
  };
  engine.set_alerts(JSON.stringify([alert]));

  const firings = [];
  for (const candle of candles) {
    for (const [index, price] of ticksOf(candle).entries()) {
      // Ticks are spread across the candle so a firing carries a plausible
      // wall-clock time rather than all four sharing the candle's open.
      const at = candle.time + index * (MINUTE_MS / 4);
      const events = engine.evaluate(args.symbol, String(price), at);
      if (events.length === 0) continue;

      firings.push({ atMs: at, price: String(price), candleOpenMs: candle.time });
      // Re-arm: the engine is one-shot, and this run counts every crossing
      // rather than only the first.
      engine.set_alerts(JSON.stringify([alert]));
    }
  }
  return firings;
}

function runRuleEngine(core, args, candles) {
  const alert = {
    id: "a1",
    symbol: args.symbol,
    condition: { price_reached: args.threshold },
    active: true,
  };
  const document = core.rule_from_alert_json(JSON.stringify(alert), args.timeframe, START_MS);
  const warmup = core.rule_warmup_candles(document);

  const firings = [];
  // One evaluation per close: at candle i, the closed series is 0..i.
  for (let i = 0; i < candles.length; i++) {
    const closed = candles.slice(0, i + 1).map((c) => ({
      open_time_ms: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: "1",
    }));
    if (closed.length < warmup) continue;

    const verdict = JSON.parse(
      core.rule_evaluate(document, JSON.stringify({ candles: { [args.timeframe]: closed } })),
    );
    if (verdict.verdict !== "fires") continue;

    // The rule path learns of a close at the moment the next candle opens.
    firings.push({ atMs: candles[i].time + MINUTE_MS, candleOpenMs: candles[i].time });
  }
  return { firings, warmup };
}

function report(args, candles, legacy, rule) {
  const line = (s = "") => console.log(s);
  line(`Shadow run — ${args.symbol} ${args.timeframe}, threshold ${args.threshold}`);
  line(`Candles: ${candles.length}, warmup: ${rule.warmup}`);
  line();
  line(`Legacy (per tick):  ${legacy.length} firing(s)`);
  line(`Rules  (per close): ${rule.firings.length} firing(s)`);
  line(`  Both are re-armed after every firing so this run counts crossings, not`);
  line(`  alarms — a real one-shot alert stops at its first. The counts are only`);
  line(`  comparable to each other, not to what a trader would see.`);
  line();

  const ruleByCandle = new Map(rule.firings.map((f) => [f.candleOpenMs, f]));
  const legacyOnly = [];
  const delays = [];

  for (const firing of legacy) {
    const counterpart = ruleByCandle.get(firing.candleOpenMs);
    if (counterpart === undefined) {
      legacyOnly.push(firing);
      continue;
    }
    delays.push(counterpart.atMs - firing.atMs);
  }

  const ruleOnly = rule.firings.filter(
    (f) => !legacy.some((l) => l.candleOpenMs === f.candleOpenMs),
  );

  if (delays.length > 0) {
    const max = Math.max(...delays);
    const avg = Math.round(delays.reduce((a, b) => a + b, 0) / delays.length);
    line(`Delay on matched firings: avg ${avg} ms, max ${max} ms`);
    if (max > MINUTE_MS) line(`  ! larger than one candle — expected at most ${MINUTE_MS} ms`);
  }

  if (legacyOnly.length > 0) {
    line();
    line(`Legacy-only: ${legacyOnly.length} — expected. A level touched intra-candle`);
    line(`that closed back below is invisible to close evaluation:`);
    for (const f of legacyOnly) {
      line(`  candle ${new Date(f.candleOpenMs).toISOString()} at price ${f.price}`);
    }
  }

  if (ruleOnly.length > 0) {
    line();
    line(`Rule-only: ${ruleOnly.length} — INVESTIGATE. The rule path fired where the`);
    line(`legacy engine did not, which the cutover does not predict:`);
    for (const f of ruleOnly) {
      line(`  candle ${new Date(f.candleOpenMs).toISOString()}`);
    }
  }

  line();
  if (rule.firings.length === 0 && legacy.length > 0) {
    line("VERDICT: the rule path fired nothing while the legacy path did.");
    line("Do not cut over — this is the silent-gap failure the shadow run is for.");
    return 1;
  }
  if (ruleOnly.length > 0) {
    line("VERDICT: unexplained rule-path firings. Investigate before cutting over.");
    return 1;
  }
  line("VERDICT: the two paths agree, with the documented close-evaluation differences.");
  return 0;
}

const args = parseArgs(process.argv.slice(2));
const candles = args.klines
  ? JSON.parse(readFileSync(resolve(process.cwd(), args.klines), "utf8"))
  : syntheticCandles(args.threshold);

if (!Array.isArray(candles) || candles.length === 0) {
  console.error("No candles to run. Pass --klines <file> with a non-empty JSON array.");
  process.exit(2);
}

const core = await loadCore();
const legacy = runLegacy(core, args, candles);
const rule = runRuleEngine(core, args, candles);
process.exit(report(args, candles, legacy, rule));
