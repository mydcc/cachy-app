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
 * FEAT-0396 — promotion, against the real core and the real rule store.
 *
 * Against the real wasm on purpose. The thing worth proving here is that the
 * TypeScript side and the core agree about what a promotion *is*, and a fake
 * `rule_promote` returning a hand-written bot would agree with anything. The
 * artefact is committed under `static/wasm/`, so this runs on a bare checkout —
 * and it fails loudly if the artefact ever lags the Rust source, which is the
 * one drift `scripts/build_wasm.sh` is silent about.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// `safeLocalStorage` is a no-op when `browser` is false (unit project
// default). Mock it to true so these tests exercise the real wrapper path
// (same pattern as `drawings.test.ts`).
vi.mock("$app/environment", () => ({ browser: true, dev: false }));

import { isRuleRefusedError, ruleSchema } from "../../lib/rules/ruleSchema";
import type { OrderIntent, RuleDocument } from "../../lib/rules/types";
import de from "../../locales/locales/de.json";
import en from "../../locales/locales/en.json";
import { RULES_STORAGE_KEY } from "./migrateAlertsToRules";
import { AlertNotFoundError, promoteAlertToBot } from "./promoteAlert";

const WASM_JS = pathToFileURL(resolve(process.cwd(), "static/wasm/technicals_wasm.js")).href;
const WASM_BINARY = resolve(process.cwd(), "static/wasm/technicals_wasm_bg.wasm");

const PROMOTED_AT_MS = 1_757_030_400_000;

/** A plain price alert, the shape the panel arms. */
function alertDocument(id: string): RuleDocument {
  return {
    schema_version: 2,
    id,
    name: `alert ${id}`,
    symbol: "BTCUSDT",
    trigger_timeframe: "1h",
    conditions: {
      kind: "compare",
      left: { kind: "price", field: "close" },
      op: "gte",
      right: { kind: "constant", value: "50000" },
      timeframe: "1h",
    },
    action: { consequence_level: "notify" },
    enabled: true,
    provenance: { source: "human", created_at_ms: 0 },
  };
}

function onePercentLong(): OrderIntent {
  return { side: "buy", size_basis: "percent_of_equity", size: "1" };
}

function stored(): RuleDocument[] {
  return JSON.parse(localStorage.getItem(RULES_STORAGE_KEY) ?? "[]") as RuleDocument[];
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
});

describe("promoting an alert into a bot", () => {
  it("writes a new document and leaves the alert armed and announcing", () => {
    const alert = ruleSchema.validate(alertDocument("alert-1"));
    seed(alert);

    const { bot, rules } = promoteAlertToBot("alert-1", onePercentLong(), PROMOTED_AT_MS);

    expect(rules).toHaveLength(2);
    // The criterion, read from the store rather than from the return value:
    // what matters is what a reload would find.
    expect(stored().find((r) => r.id === "alert-1")).toEqual(alert);
    expect(bot.id).not.toBe("alert-1");
    expect(stored().find((r) => r.id === bot.id)).toEqual(bot);
  });

  it("records the alert's content hash and starts disarmed", () => {
    const alert = ruleSchema.validate(alertDocument("alert-1"));
    seed(alert);

    const { bot } = promoteAlertToBot("alert-1", onePercentLong(), PROMOTED_AT_MS);

    expect(bot.provenance.derived_from_hash).toBe(ruleSchema.contentHash(alert));
    expect(bot.action).toEqual({
      consequence_level: "simulate",
      order: { side: "buy", size_basis: "percent_of_equity", size: "1", reduce_only: false },
    });
    expect(bot.enabled).toBe(false);
    expect(bot.provenance.created_at_ms).toBe(PROMOTED_AT_MS);
    // The strategy is carried over whole; only identity and consequence move.
    expect(bot.conditions).toEqual(alert.conditions);
    expect(bot.symbol).toBe(alert.symbol);
  });

  it("refuses a caller asking the bot to send", () => {
    seed(ruleSchema.validate(alertDocument("alert-1")));
    const { bot } = promoteAlertToBot("alert-1", onePercentLong(), PROMOTED_AT_MS);

    expect(() => ruleSchema.authorise(bot, "simulate")).not.toThrow();
    // FEAT-0396's third criterion at the seam the app actually crosses: the
    // ladder refuses, and it names the field that would have to change.
    try {
      ruleSchema.authorise(bot, "send");
      throw new Error("a `simulate` document authorised a send");
    } catch (e) {
      if (!isRuleRefusedError(e)) throw e;
      expect(e.refusals.map((r) => r.field)).toContain("action.consequence_level");
    }
  });

  it("refuses an order size no account could carry, naming the field", () => {
    seed(ruleSchema.validate(alertDocument("alert-1")));

    try {
      promoteAlertToBot(
        "alert-1",
        { side: "buy", size_basis: "percent_of_equity", size: "150" },
        PROMOTED_AT_MS,
      );
      throw new Error("an unsizable order was accepted");
    } catch (e) {
      if (!isRuleRefusedError(e)) throw e;
      expect(e.refusals.map((r) => r.field)).toContain("action.order.size");
    }
    // And nothing was written: a refused promotion leaves the store as it was.
    expect(stored()).toHaveLength(1);
  });

  it("refuses to promote an alert that is not in the store", () => {
    seed(ruleSchema.validate(alertDocument("alert-1")));

    expect(() => promoteAlertToBot("gone", onePercentLong(), PROMOTED_AT_MS)).toThrow(
      AlertNotFoundError,
    );
    expect(stored()).toHaveLength(1);
  });

  it("names the race in both locales rather than falling back to a shrug", () => {
    seed(ruleSchema.validate(alertDocument("alert-1")));

    let thrown: unknown;
    try {
      promoteAlertToBot("gone", onePercentLong(), PROMOTED_AT_MS);
    } catch (e) {
      thrown = e;
    }

    // An alert deleted in another tab between opening the promote form and
    // confirming it is a race, not a fault, and it has its own message. A
    // caller that fell through to a generic "could not be created" would
    // replace a specific answer with a shrug -- so the key has to exist in
    // both locale files, which is what this resolves rather than asserts.
    const key = (thrown as { translationKey?: string }).translationKey;
    expect(key).toBe("dashboard.alerts.panel.alertNotFound");

    for (const bundle of [de, en] as unknown as Record<string, unknown>[]) {
      const text = (key as string)
        .split(".")
        .reduce<unknown>(
          (node, part) => (node as Record<string, unknown> | undefined)?.[part],
          bundle,
        );
      expect(typeof text).toBe("string");
      expect(text).not.toBe("");
    }
  });

  it("gives the bot an identity no stored rule already holds", () => {
    const alert = ruleSchema.validate(alertDocument("alert-1"));
    seed(alert);

    const first = promoteAlertToBot("alert-1", onePercentLong(), PROMOTED_AT_MS).bot;
    const second = promoteAlertToBot("alert-1", onePercentLong(), PROMOTED_AT_MS).bot;

    // Two bots from one alert is the supported case — same strategy, different
    // size — so the second must not overwrite the first.
    expect(second.id).not.toBe(first.id);
    expect(stored().map((r) => r.id).sort()).toEqual(
      ["alert-1", first.id, second.id].sort(),
    );
    expect(second.provenance.derived_from_hash).toBe(first.provenance.derived_from_hash);
  });
});
