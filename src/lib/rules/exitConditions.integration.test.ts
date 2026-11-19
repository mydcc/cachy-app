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
 * FEAT-0809 — exit conditions and the take-profit distance, against the real
 * wasm.
 *
 * Every claim here is a claim about the Rust core: that documents without the
 * new fields keep their recorded identity, that documents with them validate
 * and hash the way the spec promises, and that every refusal names its field
 * and carries an i18n key that resolves in both bundles — a refusal a trader
 * cannot read is a refusal that gets worked around. A fake `rule_content_hash`
 * would agree with any answer, so the committed artefact under `static/wasm/`
 * is the only honest witness. It fails loudly if the artefact ever lags the
 * Rust source, which is the one drift `scripts/build_wasm.sh` is silent about.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

import de from "../../locales/locales/de.json";
import en from "../../locales/locales/en.json";
import { isRuleRefusedError, ruleSchema } from "./ruleSchema";
import type { ExitRule, RuleDocument, StopDistance } from "./types";

const WASM_JS = pathToFileURL(resolve(process.cwd(), "static/wasm/technicals_wasm.js")).href;
const WASM_BINARY = resolve(process.cwd(), "static/wasm/technicals_wasm_bg.wasm");

/**
 * Hashes measured against the artefact as it shipped *before* `exits` and
 * `take_profit` existed — the same fixtures, and therefore the same numbers,
 * as `stopDistance.integration.test.ts`'s alarm: if a field this PR adds
 * inside the hashed half of the document ever stops being
 * `skip_serializing_if`, every strategy identity a journal entry has
 * recorded moves silently, and these two lines are what goes red.
 */
const HASH_BEFORE_EXITS_EXISTED = {
  alert: "376e83b0491797113b53729e9efbbbe17cde4fbd830484af24ad61cee327b9fd",
  bot: "2080995af5ad63d6f37cb61f04c83a27984ca4cf62dfa72bbcfc6310c3d7a214",
};

function alertDocument(): RuleDocument {
  return {
    schema_version: 2,
    id: "pinned-1",
    name: "pinned",
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

function botDocument(overrides: { side?: "buy" | "sell"; exits?: ExitRule[]; takeProfit?: StopDistance } = {}): RuleDocument {
  return {
    ...alertDocument(),
    id: "pinned-2",
    action: {
      consequence_level: "simulate",
      order: {
        side: overrides.side ?? "buy",
        size_basis: "percent_of_equity",
        size: "1",
      },
    },
    ...(overrides.exits ? { exits: overrides.exits } : {}),
    ...(overrides.takeProfit ? { take_profit: overrides.takeProfit } : {}),
  };
}

/** An exit that closes everything once the price clears a level. */
function exitAll(when: ExitRule["when"]): ExitRule {
  return { when, close: "all" };
}

/** Resolves a dotted key against a locale bundle, or undefined. */
function lookup(bundle: unknown, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], bundle);
}

/** The first refusal matching a predicate, with a message naming what came back. */
function refusalFrom(e: unknown, predicate: (r: { code: string; field: string; i18n_key: string }) => boolean) {
  if (!isRuleRefusedError(e)) throw e;
  const refusal = e.refusals.find(predicate);
  expect(refusal, `no refusal matched: ${JSON.stringify(e.refusals)}`).toBeDefined();
  return refusal!;
}

beforeAll(async () => {
  const mod = (await import(/* @vite-ignore */ WASM_JS)) as {
    default: (binary: BufferSource) => Promise<unknown>;
  };
  await mod.default(readFileSync(WASM_BINARY));
  ruleSchema.setLoader(async () => mod as never);
  await ruleSchema.load();
});

describe("a bot's exit conditions", () => {
  it("leave every hash recorded before the fields existed exactly where they were", () => {
    expect(ruleSchema.contentHash(alertDocument())).toBe(HASH_BEFORE_EXITS_EXISTED.alert);
    expect(ruleSchema.contentHash(botDocument())).toBe(HASH_BEFORE_EXITS_EXISTED.bot);
  });

  it("are part of the strategy, so adding one is a new identity", () => {
    const without = ruleSchema.contentHash(botDocument());
    const withExits = ruleSchema.contentHash(
      botDocument({
        exits: [exitAll({
          kind: "compare",
          left: { kind: "price", field: "close" },
          op: "gte",
          right: { kind: "constant", value: "60000" },
          timeframe: "1h",
        })],
      }),
    );
    expect(withExits).not.toBe(without);
  });

  it("and so is the take-profit distance", () => {
    const without = ruleSchema.contentHash(botDocument());
    const withTarget = ruleSchema.contentHash(
      botDocument({ takeProfit: { basis: "percent_of_entry", distance: "3" } }),
    );
    expect(withTarget).not.toBe(without);
  });

  it("round-trip through the wasm validator, exits and take-profit together", () => {
    expect(() =>
      ruleSchema.validate(
        botDocument({
          exits: [
            {
              when: {
                kind: "compare",
                left: { kind: "price", field: "close" },
                op: "gte",
                right: { kind: "constant", value: "60000" },
                timeframe: "1h",
              },
              close: "partial",
              fraction: "0.5",
            },
          ],
          takeProfit: { basis: "percent_of_entry", distance: "3" },
        }),
      ),
    ).not.toThrow();
  });

  it("accept the G1-decided operand: an exit on unrealised_pnl_percent validates", () => {
    // The same account condition the trigger already offers, legal inside
    // exits from `simulate` up; refused nowhere except by the general exit
    // rules. This is the acceptance criterion TODO #32's decision added.
    expect(() =>
      ruleSchema.validate(
        botDocument({
          exits: [exitAll({ kind: "account", field: "unrealised_pnl_percent", op: "lte", value: "-2" })],
        }),
      ),
    ).not.toThrow();
  });

  it("refuse to ride on a notify document, naming the exit field in both locales", () => {
    try {
      ruleSchema.validate({ ...alertDocument(), exits: [exitAll({
        kind: "compare",
        left: { kind: "price", field: "close" },
        op: "gte",
        right: { kind: "constant", value: "60000" },
        timeframe: "1h",
      })] });
      throw new Error("a notify document with exits was accepted");
    } catch (e) {
      const refusal = refusalFrom(e, (r) => r.i18n_key === "rules.refusal.exitsAtNotifyLevel");
      expect(refusal.field).toBe("exits");
      for (const bundle of [de, en]) {
        expect(typeof lookup(bundle, refusal.i18n_key)).toBe("string");
      }
    }
  });

  it("refuse a take-profit on a notify document too, naming take_profit", () => {
    try {
      ruleSchema.validate({ ...alertDocument(), take_profit: { basis: "percent_of_entry", distance: "3" } });
      throw new Error("a notify document with a take-profit was accepted");
    } catch (e) {
      const refusal = refusalFrom(e, (r) => r.i18n_key === "rules.refusal.exitsAtNotifyLevel");
      expect(refusal.field).toBe("take_profit");
    }
  });

  it("refuse an empty exits array — absence already means none", () => {
    try {
      ruleSchema.validate(botDocument({ exits: [] }));
      throw new Error("an empty exits array was accepted");
    } catch (e) {
      const refusal = refusalFrom(e, (r) => r.i18n_key === "rules.refusal.emptyExitsArray");
      expect(refusal.field).toBe("exits");
      for (const bundle of [de, en]) {
        expect(typeof lookup(bundle, refusal.i18n_key)).toBe("string");
      }
    }
  });

  it("refuse a partial exit without a fraction, naming the slot", () => {
    try {
      ruleSchema.validate(
        botDocument({
          exits: [{ when: { kind: "position", side: "long", open: true }, close: "partial" }],
        }),
      );
      throw new Error("a partial exit without a fraction was accepted");
    } catch (e) {
      const refusal = refusalFrom(e, (r) => r.i18n_key === "rules.refusal.exitFractionInvalid");
      expect(refusal.field).toBe("exits[0].fraction");
    }
  });

  it("refuse an external feed as an exit, and the refusal reads in both locales", () => {
    // ADR-0012 decision 7, extended to the third site: a feed may veto a
    // trigger, never close on one — an exit is an action, and a backtest
    // cannot replay a closing decision made on an unversioned feed.
    try {
      ruleSchema.validate(
        botDocument({
          exits: [exitAll({ kind: "external_feed", feed: "liquidation_heatmap", op: "gt", value: "0.9" })],
        }),
      );
      throw new Error("an external feed was accepted as an exit");
    } catch (e) {
      const refusal = refusalFrom(e, (r) => r.i18n_key === "rules.refusal.externalFeedExit");
      expect(refusal.field).toBe("exits[0].when");
      for (const bundle of [de, en]) {
        expect(typeof lookup(bundle, refusal.i18n_key)).toBe("string");
      }
    }
  });

  it("validate the take-profit distance like a stop, mirrored to the target side", () => {
    // Not positive.
    try {
      ruleSchema.validate(botDocument({ takeProfit: { basis: "percent_of_entry", distance: "0" } }));
      throw new Error("a zero take-profit distance was accepted");
    } catch (e) {
      const refusal = refusalFrom(e, (r) => r.field === "take_profit.distance");
      expect(refusal.i18n_key).toBe("rules.refusal.invalidDecimal");
    }

    // A short's target sits below its entry: a hundred percent down is zero.
    try {
      ruleSchema.validate(
        botDocument({ side: "sell", takeProfit: { basis: "percent_of_entry", distance: "150" } }),
      );
      throw new Error("a short with a target through zero was accepted");
    } catch (e) {
      refusalFrom(e, (r) => r.field === "take_profit.distance");
    }

    // The same distance on a long names a price above entry that exists.
    expect(() =>
      ruleSchema.validate(botDocument({ takeProfit: { basis: "percent_of_entry", distance: "150" } })),
    ).not.toThrow();
  });
});
