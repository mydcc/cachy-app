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
 * FEAT-0746 — pause/resume and duplicate, against the real core and store.
 *
 * The content hash and the anchor ledger are the two things a fake cannot
 * prove: a pause must not change the hash, and a drawing duplicate must keep
 * its binding rather than silently becoming a fixed-price rule.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/env", () => ({ browser: true, dev: false }));

import { ruleSchema } from "../../lib/rules/ruleSchema";
import type { RuleDocument } from "../../lib/rules/types";
import { ruleEvaluationGate } from "../../lib/rules/ruleEvaluationGate";
import * as utils from "../../utils/utils";
import { safeLocalStorage } from "../../utils/storageWrapper";
import { RULE_DRAWING_STORAGE_KEY, recordDrawingAnchor } from "./drawingAnchors";
import * as armRuleModule from "./armRule";
import { readRuleStore, RuleConflictError } from "./armRule";
import { RULES_STORAGE_KEY } from "./migrateAlertsToRules";
import { RULE_STATE_STORAGE_KEY } from "./ruleStateStore";
import { duplicateRule, setRuleEnabled } from "./ruleActions";

const WASM_JS = pathToFileURL(resolve(process.cwd(), "static/wasm/technicals_wasm.js")).href;
const WASM_BINARY = resolve(process.cwd(), "static/wasm/technicals_wasm_bg.wasm");

function rule(overrides: Partial<RuleDocument> = {}): RuleDocument {
  return {
    schema_version: 2,
    id: "rule-1",
    name: "BTC breakout",
    symbol: "BTCUSDT",
    trigger_timeframe: "1h",
    conditions: {
      kind: "compare",
      left: { kind: "price", field: "close" },
      op: "gt",
      right: { kind: "constant", value: "70000" },
      timeframe: "1h",
    },
    action: { consequence_level: "notify" },
    enabled: true,
    provenance: { source: "human", created_at_ms: 1 },
    ...overrides,
  };
}

function seed(...rules: RuleDocument[]) {
  localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(rules));
}

beforeAll(async () => {
  const mod = (await import(/* @vite-ignore */ WASM_JS)) as {
    default: (binary: BufferSource) => Promise<unknown>;
  };
  await mod.default(readFileSync(WASM_BINARY));
  ruleSchema.setLoader(async () => mod as never);
  await ruleSchema.load();
});

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("setRuleEnabled — FEAT-0746", () => {
  it("flips only enabled on the stored document and keeps the content hash", () => {
    seed(rule());
    const before = ruleSchema.contentHash(readRuleStore()[0]);

    const paused = setRuleEnabled("rule-1", false);

    expect(paused.ok).toBe(true);
    const stored = readRuleStore();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      id: "rule-1",
      name: "BTC breakout",
      enabled: false,
    });
    expect(ruleSchema.contentHash(stored[0])).toBe(before);
  });

  it("keeps the persisted anchors and fired count through pause and resume", () => {
    seed(rule());
    const forget = vi.spyOn(ruleEvaluationGate, "forget");
    localStorage.setItem(
      RULE_STATE_STORAGE_KEY,
      JSON.stringify({
        "rule-1": {
          fired_count: 1,
          last_fired_anchor_ms: 60_000,
          last_evaluated_anchor_ms: 60_000,
        },
      }),
    );

    setRuleEnabled("rule-1", false);
    setRuleEnabled("rule-1", true);

    expect(forget).not.toHaveBeenCalled();
    expect(
      JSON.parse(localStorage.getItem(RULE_STATE_STORAGE_KEY) ?? "{}")["rule-1"],
    ).toMatchObject({
      fired_count: 1,
      last_fired_anchor_ms: 60_000,
      last_evaluated_anchor_ms: 60_000,
    });
  });

  it("returns a reason for an unknown id and for a bot", () => {
    seed(rule({ id: "bot", action: { consequence_level: "simulate" } }));

    expect(setRuleEnabled("missing", false)).toMatchObject({
      ok: false,
      reason: "unknown",
    });
    expect(setRuleEnabled("bot", false)).toMatchObject({
      ok: false,
      reason: "bot",
    });
  });

  it("does not throw on an unreadable rule store", () => {
    localStorage.setItem(RULES_STORAGE_KEY, "{not json");

    expect(setRuleEnabled("rule-1", false)).toMatchObject({
      ok: false,
      reason: "unreadable",
    });
  });

  it("reports a silently failed write instead of calling it paused", () => {
    seed(rule());
    const originalSet = safeLocalStorage.setItem.bind(safeLocalStorage);
    const setItem = vi
      .spyOn(safeLocalStorage, "setItem")
      .mockImplementation((key: string, value: string) => {
        if (key === RULES_STORAGE_KEY) return false;
        return originalSet(key, value);
      });

    const result = setRuleEnabled("rule-1", false);

    expect(result).toMatchObject({ ok: false, reason: "write-failed" });
    expect(readRuleStore()[0].enabled).toBe(true);
    setItem.mockRestore();
  });

  it("reports a concurrent change instead of overwriting it", () => {
    seed(rule());
    const arm = vi
      .spyOn(armRuleModule, "armRule")
      .mockImplementation(() => {
        throw new RuleConflictError();
      });

    expect(setRuleEnabled("rule-1", false)).toMatchObject({
      ok: false,
      reason: "conflict",
    });

    arm.mockRestore();
  });

  it("a resumed rule cannot decide an anchor it already fired on", () => {
    const document = rule({ id: "gate-rule" });
    seed(document);
    const warmup = vi.spyOn(ruleSchema, "warmupCandles").mockReturnValue(0);
    const evaluate = vi
      .spyOn(ruleSchema, "evaluate")
      .mockReturnValue({ verdict: "fires" });
    const ctx = {
      candles: {
        "1h": [
          {
            open_time_ms: 60_000,
            open: "1",
            high: "1",
            low: "1",
            close: "1",
            volume: "0",
          },
        ],
      },
    } as never;
    ruleEvaluationGate.forget("gate-rule");

    expect(ruleEvaluationGate.evaluate(document, ctx, 60_000)).toEqual({
      verdict: "fires",
    });

    setRuleEnabled("gate-rule", false);
    setRuleEnabled("gate-rule", true);

    // The gate already decided this anchor; the pause must not have forgotten
    // it, or resuming would announce the same candle twice.
    expect(ruleEvaluationGate.evaluate(document, ctx, 60_000)).toBeUndefined();
    expect(evaluate).toHaveBeenCalledTimes(1);

    warmup.mockRestore();
    evaluate.mockRestore();
  });
});

describe("duplicateRule — FEAT-0746", () => {
  it("creates a paused copy with a new id and the source hash", () => {
    const source = rule();
    seed(source);
    const sourceHash = ruleSchema.contentHash(source);

    const result = duplicateRule("rule-1", "BTC breakout (copy)");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rule.id).not.toBe("rule-1");
    expect(result.rule.name).toBe("BTC breakout (copy)");
    expect(result.rule.enabled).toBe(false);
    expect(result.rule.conditions).toEqual(source.conditions);
    expect(result.rule.action).toEqual(source.action);
    expect(result.rule.provenance.derived_from_hash).toBe(sourceHash);
    // The only differences are outside the content hash.
    expect(ruleSchema.contentHash(result.rule)).toBe(sourceHash);

    const stored = readRuleStore();
    expect(stored).toHaveLength(2);
    expect(stored.find((r) => r.id === "rule-1")).toEqual(source);
    expect(stored.find((r) => r.id === result.rule.id)).toEqual(result.rule);
  });

  it("keeps the drawing binding on a drawing duplicate", () => {
    seed(rule());
    recordDrawingAnchor("rule-1", {
      drawingId: "draw-1",
      symbol: "BTCUSDT",
      createdAtMs: 1,
    });

    const result = duplicateRule("rule-1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      JSON.parse(localStorage.getItem(RULE_DRAWING_STORAGE_KEY) ?? "{}"),
    ).toMatchObject({
      "rule-1": { drawingId: "draw-1", symbol: "BTCUSDT" },
      [result.rule.id]: { drawingId: "draw-1", symbol: "BTCUSDT" },
    });
  });

  it("rolls the copy back when its drawing binding cannot be stored", () => {
    seed(rule());
    recordDrawingAnchor("rule-1", {
      drawingId: "draw-1",
      symbol: "BTCUSDT",
      createdAtMs: 1,
    });
    const originalSet = safeLocalStorage.setItem.bind(safeLocalStorage);
    const setItem = vi
      .spyOn(safeLocalStorage, "setItem")
      .mockImplementation((key: string, value: string) => {
        if (key === RULE_DRAWING_STORAGE_KEY) throw new Error("quota");
        return originalSet(key, value);
      });

    const result = duplicateRule("rule-1");

    expect(result).toMatchObject({ ok: false, reason: "anchor-failed" });
    expect(readRuleStore()).toHaveLength(1);
    setItem.mockRestore();
  });

  it("refuses a bot, an unknown id and an unreadable ledger", () => {
    seed(rule({ id: "bot", action: { consequence_level: "simulate" } }));

    expect(duplicateRule("bot")).toMatchObject({ ok: false, reason: "bot" });
    expect(duplicateRule("missing")).toMatchObject({ ok: false, reason: "unknown" });

    seed(rule());
    localStorage.setItem(RULE_DRAWING_STORAGE_KEY, "not json");
    expect(duplicateRule("rule-1")).toMatchObject({
      ok: false,
      reason: "unreadable",
    });
  });

  it("refuses a send rule instead of copying an order intent", () => {
    seed(rule({ action: { consequence_level: "send" } }));

    expect(duplicateRule("rule-1")).toMatchObject({
      ok: false,
      reason: "bot",
    });
    expect(readRuleStore()).toHaveLength(1);
  });

  it("does not claim success when the copy was not stored", () => {
    seed(rule());
    const originalSet = safeLocalStorage.setItem.bind(safeLocalStorage);
    const setItem = vi
      .spyOn(safeLocalStorage, "setItem")
      .mockImplementation((key: string, value: string) => {
        if (key === RULES_STORAGE_KEY) return false;
        return originalSet(key, value);
      });

    const result = duplicateRule("rule-1");

    expect(result).toMatchObject({ ok: false, reason: "unreadable" });
    expect(readRuleStore()).toHaveLength(1);
    setItem.mockRestore();
  });

  it("reports an unavailable core instead of blaming the document", () => {
    seed(rule());
    const ready = vi.spyOn(ruleSchema, "isReady").mockReturnValue(false);

    expect(duplicateRule("rule-1")).toMatchObject({
      ok: false,
      reason: "core-unavailable",
    });

    ready.mockRestore();
  });

  it("refuses a source the core will not accept", () => {
    seed(rule({ valid_until_ms: 0 }));

    expect(duplicateRule("rule-1")).toMatchObject({
      ok: false,
      reason: "invalid",
    });
    expect(readRuleStore()).toHaveLength(1);
  });

  it("gives the copy its own name fallback, created_at and fire state", () => {
    seed(rule());
    localStorage.setItem(
      RULE_STATE_STORAGE_KEY,
      JSON.stringify({ "rule-1": { fired_count: 3 } }),
    );

    const result = duplicateRule("rule-1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rule.name).toBe("BTC breakout");
    expect(result.rule.provenance.created_at_ms).toBeGreaterThan(1);
    const states = JSON.parse(localStorage.getItem(RULE_STATE_STORAGE_KEY) ?? "{}");
    expect(states[result.rule.id]).toBeUndefined();
    expect(states["rule-1"]).toMatchObject({ fired_count: 3 });
  });

  it("migrates a v1 source to a v2 copy without rewriting the source", () => {
    seed(rule({ schema_version: 1 }));

    const result = duplicateRule("rule-1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rule.schema_version).toBe(2);
    expect(readRuleStore().find((r) => r.id === "rule-1")?.schema_version).toBe(1);
  });

  it("never reuses a stored id, because armRule replaces by id", () => {
    seed(rule());
    const generate = vi
      .spyOn(utils, "generateId")
      .mockReturnValueOnce("rule-1")
      .mockReturnValueOnce("fresh-id");

    const result = duplicateRule("rule-1");

    expect(result.ok && result.rule.id).toBe("fresh-id");
    expect(readRuleStore()).toHaveLength(2);
    generate.mockRestore();
  });
});
