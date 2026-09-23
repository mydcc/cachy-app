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
 * FEAT-0396 — what the Automation tab is allowed to do to the rule store.
 *
 * Against the real core, because the load-bearing claim here is a claim about
 * the *hash*: switching a bot on and off must move nothing a journal entry
 * recorded. A fake `rule_content_hash` would agree with any answer, including
 * a wrong one.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// `safeLocalStorage` is a no-op when `browser` is false (unit project
// default). Mock it to true so these tests exercise the real wrapper path
// (same pattern as `drawings.test.ts`).
vi.mock("$app/environment", () => ({ browser: true, dev: false }));

import { ruleSchema } from "../../lib/rules/ruleSchema";
import type { RuleDocument } from "../../lib/rules/types";
import { deleteBot, isBot, readBots, setBotEnabled } from "./botStore";
import { RULES_STORAGE_KEY } from "./migrateAlertsToRules";
import { promoteAlertToBot } from "./promoteAlert";

const WASM_JS = pathToFileURL(resolve(process.cwd(), "static/wasm/technicals_wasm.js")).href;
const WASM_BINARY = resolve(process.cwd(), "static/wasm/technicals_wasm_bg.wasm");

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

function stored(): RuleDocument[] {
  return JSON.parse(localStorage.getItem(RULES_STORAGE_KEY) ?? "[]") as RuleDocument[];
}

/** An alert in the store, and a bot promoted from it. */
function seedAlertAndBot(): { alert: RuleDocument; bot: RuleDocument } {
  const alert = ruleSchema.validate(alertDocument("alert-1"));
  localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify([alert]));
  const { bot } = promoteAlertToBot(
    "alert-1",
    { side: "buy", size_basis: "percent_of_equity", size: "1" },
    1_757_030_400_000,
  );
  return { alert, bot };
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

describe("the bots the Automation tab manages", () => {
  it("lists simulate rules and leaves the alerts to the alert panel", () => {
    const { alert, bot } = seedAlertAndBot();

    expect(isBot(bot)).toBe(true);
    expect(isBot(alert)).toBe(false);
    expect(readBots().map((r) => r.id)).toEqual([bot.id]);
  });

  it("keeps a disabled bot in the list rather than hiding it", () => {
    const { bot } = seedAlertAndBot();

    // Promotion already leaves it off, which is the state a trader first sees.
    expect(bot.enabled).toBe(false);
    expect(readBots().map((r) => r.id)).toEqual([bot.id]);

    setBotEnabled(bot.id, true);
    expect(readBots()[0].enabled).toBe(true);

    setBotEnabled(bot.id, false);
    // A bot that vanished when switched off would read as deleted, and one a
    // trader cannot see is one they cannot switch back on.
    expect(readBots().map((r) => r.id)).toEqual([bot.id]);
    expect(readBots()[0].enabled).toBe(false);
  });

  it("changes no content hash when a bot is armed or disarmed", () => {
    const { bot } = seedAlertAndBot();
    const hash = ruleSchema.contentHash(bot);

    const armed = setBotEnabled(bot.id, true);
    expect(armed).toBeDefined();
    expect(ruleSchema.contentHash(armed as RuleDocument)).toBe(hash);

    const disarmed = setBotEnabled(bot.id, false);
    expect(ruleSchema.contentHash(disarmed as RuleDocument)).toBe(hash);

    // And the lineage it was promoted with is untouched by either.
    expect(disarmed?.provenance.derived_from_hash).toBe(bot.provenance.derived_from_hash);
  });

  it("reports an unknown id instead of throwing at a toggle in a list", () => {
    seedAlertAndBot();
    expect(setBotEnabled("gone", true)).toBeUndefined();
  });

  it("deletes a bot and refuses to delete an alert", () => {
    const { bot } = seedAlertAndBot();

    // The Automation tab must not be able to delete an alert the trader armed
    // from the panel, so the function cannot express it.
    expect(deleteBot("alert-1")).toBe(false);
    expect(stored().map((r) => r.id).sort()).toEqual(["alert-1", bot.id].sort());

    expect(deleteBot(bot.id)).toBe(true);
    expect(stored().map((r) => r.id)).toEqual(["alert-1"]);
    expect(readBots()).toEqual([]);
  });

  it("never authorises a send, armed or not", () => {
    const { bot } = seedAlertAndBot();
    const armed = setBotEnabled(bot.id, true) as RuleDocument;

    // Arming raises no consequence: the ladder is decided by the level the
    // document was authored at, and nothing on this tab can change it.
    expect(() => ruleSchema.authorise(armed, "send")).toThrow();
    expect(() => ruleSchema.authorise(armed, "simulate")).not.toThrow();
  });
});
