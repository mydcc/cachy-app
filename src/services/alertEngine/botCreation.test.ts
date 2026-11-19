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
 * FEAT-0811 — direct creation, against the real core and the real store.
 *
 * The same discipline `promoteAlert.integration.test.ts` holds: what is worth
 * proving is that the assembled draft is a document the core accepts — and
 * that a refusal leaves the store exactly as it was, because the write
 * happens only after validation. A fake validate would agree with anything.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/env", () => ({ browser: true, dev: false }));

import { isRuleRefusedError, ruleSchema } from "../../lib/rules/ruleSchema";
import type { ExitRule, RuleDocument } from "../../lib/rules/types";
import { RULES_STORAGE_KEY } from "./migrateAlertsToRules";
import { createBotDraft, type BotDraftFields } from "./promoteAlert";

const WASM_JS = pathToFileURL(resolve(process.cwd(), "static/wasm/technicals_wasm.js")).href;
const WASM_BINARY = resolve(process.cwd(), "static/wasm/technicals_wasm_bg.wasm");

const CREATED_AT_MS = 1_757_030_400_000;

/** The minimum the create form must answer: what to watch and what to do. */
function fields(overrides: Partial<BotDraftFields> = {}): BotDraftFields {
  return {
    name: "my first bot",
    symbol: "BTCUSDT",
    trigger_timeframe: "1h",
    conditions: {
      kind: "compare",
      left: { kind: "price", field: "close" },
      op: "gte",
      right: { kind: "constant", value: "50000" },
      timeframe: "1h",
    },
    order: {
      side: "buy",
      size_basis: "percent_of_equity",
      size: "1",
      stop: { basis: "percent_of_entry", distance: "2" },
    },
    ...overrides,
  };
}

function stored(): RuleDocument[] {
  return JSON.parse(localStorage.getItem(RULES_STORAGE_KEY) ?? "[]") as RuleDocument[];
}

/** A stored alert so the id discipline can be observed against a neighbour. */
function seededAlert(): RuleDocument {
  return {
    schema_version: 2,
    id: "alert-1",
    name: "alert",
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

describe("creating a bot directly (FEAT-0811)", () => {
  it("writes an unarmed draft the store holds verbatim", () => {
    const before = seededAlert();
    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify([before]));

    const { bot, rules } = createBotDraft(fields(), CREATED_AT_MS);

    expect(rules).toHaveLength(2);
    // Read from the store, not the return value: what a reload finds is the
    // criterion, the same one promotion holds itself to.
    const storedBot = stored().find((r) => r.id === bot.id);
    expect(storedBot).toBeDefined();
    // The unarmed draft: creating is choosing, arming is a separate act.
    expect(storedBot?.enabled).toBe(false);
    expect(storedBot?.action.consequence_level).toBe("simulate");
    expect(storedBot?.name).toBe("my first bot");
    expect(storedBot?.provenance).toEqual({
      source: "human",
      created_at_ms: CREATED_AT_MS,
    });
    // The neighbour is untouched — no promotion ever happened, and nothing
    // about creation rewrites the rules that already were.
    expect(stored().find((r) => r.id === "alert-1")).toEqual(before);
  });

  it("stamps the version the core currently reads and picks a free id", () => {
    localStorage.setItem(
      RULES_STORAGE_KEY,
      JSON.stringify([seededAlert(), { ...seededAlert(), id: "rule-1" }]),
    );

    const { bot } = createBotDraft(fields());

    expect(bot.schema_version).toBe(ruleSchema.schemaVersion());
    expect(bot.id).not.toBe("alert-1");
    expect(bot.id).not.toBe("rule-1");
    expect(stored().map((r) => r.id)).toContain(bot.id);
  });

  it("falls back to the symbol for a nameless draft", () => {
    const { bot } = createBotDraft(fields({ name: undefined }));
    expect(bot.name).toBe("BTCUSDT");
  });

  it("keeps every optional field absent when the form sends none", () => {
    const { bot } = createBotDraft(fields());
    // The canonical form the core serialises: absent means the default, and
    // a draft that never said "exit" carries no exits key at all — the same
    // discipline AC8 holds the editor to.
    expect(bot.exits).toBeUndefined();
    expect(bot.take_profit).toBeUndefined();
    expect(bot.firing_policy).toBeUndefined();
    expect(bot.max_positions).toBeUndefined();
    expect(bot.entry_trigger).toBeUndefined();
  });

  it("round-trips the full set: exits, target, policy, limits, trigger mode", () => {
    const exit: ExitRule = {
      when: {
        kind: "compare",
        left: { kind: "price", field: "close" },
        op: "gte",
        right: { kind: "constant", value: "60000" },
        timeframe: "1h",
      },
      close: "partial",
      fraction: "0.5",
    };

    const { bot } = createBotDraft(
      fields({
        exits: [exit],
        take_profit: { basis: "percent_of_entry", distance: "5" },
        firing_policy: "multi",
        max_positions: 2,
        max_entries_per_day: 3,
        max_risk_per_position: "100",
        budget_cap: "500",
        entry_trigger: "confirmation",
      }),
    );

    expect(bot.exits).toEqual([exit]);
    expect(bot.take_profit).toEqual({ basis: "percent_of_entry", distance: "5" });
    expect(bot.firing_policy).toBe("multi");
    expect(bot.max_positions).toBe(2);
    expect(bot.max_entries_per_day).toBe(3);
    expect(bot.max_risk_per_position).toBe("100");
    expect(bot.budget_cap).toBe("500");
    expect(bot.entry_trigger).toBe("confirmation");
  });

  it("refuses a partial exit without a fraction and writes nothing", () => {
    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify([seededAlert()]));
    const before = stored();

    let thrown: unknown;
    try {
      createBotDraft(
        fields({
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
            },
          ],
        }),
      );
    } catch (e) {
      thrown = e;
    }

    // The refusal names the row's fraction slot, the anchor the editor maps
    // to the field that earned it.
    expect(thrown).toBeDefined();
    expect(isRuleRefusedError(thrown)).toBe(true);
    const refusal = (thrown as { refusals: Array<{ field: string; code: string }> })
      .refusals[0];
    expect(refusal.code).toBe("exit_fraction_invalid");
    expect(refusal.field).toContain("fraction");
    // And the write never happened: validation precedes the store, so a
    // refused draft leaves the trader's rules exactly as they were.
    expect(stored()).toEqual(before);
  });

  it("refuses an empty exits array rather than storing a lie", () => {
    let thrown: unknown;
    try {
      createBotDraft(fields({ exits: [] }));
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeDefined();
    expect(isRuleRefusedError(thrown)).toBe(true);
    // The store's answer to "no exits" is the absent key, never an array a
    // reload would have to interpret.
    expect(stored()).toEqual([]);
  });

  it("refuses a zero limit and writes nothing", () => {
    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify([seededAlert()]));
    const before = stored();

    let thrown: unknown;
    try {
      createBotDraft(fields({ max_positions: 0 }));
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeDefined();
    expect(isRuleRefusedError(thrown)).toBe(true);
    expect(stored()).toEqual(before);
  });
});

describe("a recurring bot's gate is a document the core accepts (FEAT-0811)", () => {
  it("round-trips firing_policy `multi` together with the derived frequency", () => {
    const { bot } = createBotDraft(
      fields({ firing_policy: "multi", frequency: "once_per_candle_close", max_positions: 2 }),
      CREATED_AT_MS,
    );

    expect(bot.firing_policy).toBe("multi");
    expect(bot.frequency).toBe("once_per_candle_close");
    expect(stored()[0]?.frequency).toBe("once_per_candle_close");
    // Still an unarmed draft: opening the announcement gate arms nothing.
    expect(bot.enabled).toBe(false);
  });
});
