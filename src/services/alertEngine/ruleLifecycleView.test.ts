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

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/environment", () => ({ browser: true }));

import type { RuleDocument } from "../../lib/rules/types";
import { alertLifecycleStatuses, lifecycleOf } from "./ruleLifecycleView";
import { RULES_STORAGE_KEY } from "./migrateAlertsToRules";
import { RULE_ORIGIN_STORAGE_KEY } from "./ruleOriginLedger";
import { RULE_STATE_STORAGE_KEY } from "./ruleStateStore";

const NOW = 1_800_000_000_000;

function ruleDoc(overrides: Partial<RuleDocument> = {}): RuleDocument {
  return {
    schema_version: 2,
    id: "rule-a",
    name: "Support retest",
    symbol: "BTCUSDT",
    trigger_timeframe: "1m",
    conditions: { price_reached: "72000" } as unknown as RuleDocument["conditions"],
    action: { consequence_level: "notify" } as RuleDocument["action"],
    provenance: { source: "human", created_at_ms: NOW - 1_000 },
    ...overrides,
  };
}

describe("lifecycleOf", () => {
  it("calls a rule past its validity period expired", () => {
    expect(lifecycleOf(ruleDoc({ valid_until_ms: NOW - 1 }), 0, NOW)).toBe("expired");
  });

  it("leaves a rule inside its validity period armed", () => {
    expect(lifecycleOf(ruleDoc({ valid_until_ms: NOW + 1 }), 0, NOW)).toBe("armed");
  });

  it("leaves a rule with no validity period armed", () => {
    expect(lifecycleOf(ruleDoc(), 0, NOW)).toBe("armed");
  });

  /*
   * FEAT-0393 AC 2 read the other way round: an alarm the trader *heard* must
   * never be relabelled as one that lapsed untriggered.
   */
  it("calls a rule that fired before expiring fired, not expired", () => {
    expect(lifecycleOf(ruleDoc({ valid_until_ms: NOW - 1 }), 1, NOW)).toBe("fired");
  });

  it("ignores a nonsense validity timestamp", () => {
    expect(lifecycleOf(ruleDoc({ valid_until_ms: Number.NaN }), 0, NOW)).toBe("armed");
  });
});

describe("alertLifecycleStatuses", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function seed(rules: RuleDocument[], origins: Record<string, { alertId: string }>) {
    // The ledger refuses an entry without `migratedAtMs`; supply it here so the
    // test exercises the join and not the ledger's own validation.
    const entries = Object.fromEntries(
      Object.entries(origins).map(([ruleId, e]) => [ruleId, { ...e, migratedAtMs: NOW - 10_000 }]),
    );
    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(rules));
    localStorage.setItem(
      RULE_ORIGIN_STORAGE_KEY,
      JSON.stringify({ schema_version: 1, entries }),
    );
  }

  it("answers by legacy alert id, not by rule id", () => {
    seed([ruleDoc({ id: "rule-a", valid_until_ms: NOW - 1 })], { "rule-a": { alertId: "alert-1" } });

    const statuses = alertLifecycleStatuses(NOW);

    expect(statuses.get("alert-1")).toBe("expired");
    expect(statuses.has("rule-a")).toBe(false);
  });

  it("says nothing about an alert no rule was migrated from", () => {
    seed([], {});
    expect(alertLifecycleStatuses(NOW).size).toBe(0);
  });

  it("reads the fire count from the state store", () => {
    seed([ruleDoc({ id: "rule-a", valid_until_ms: NOW - 1 })], { "rule-a": { alertId: "alert-1" } });
    localStorage.setItem(RULE_STATE_STORAGE_KEY, JSON.stringify({ "rule-a": { fired_count: 1 } }));

    expect(alertLifecycleStatuses(NOW).get("alert-1")).toBe("fired");
  });

  it("skips a ledger entry whose rule was deleted", () => {
    seed([], { "rule-a": { alertId: "alert-1" } });
    expect(alertLifecycleStatuses(NOW).size).toBe(0);
  });
});
