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
import { alarmRows, lifecycleOf } from "./ruleLifecycleView";
import { RULES_STORAGE_KEY } from "./migrateAlertsToRules";
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

describe("alarmRows", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function seed(rules: unknown[]) {
    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(rules));
  }

  it("answers by rule id, because the rule is now the only store", () => {
    // FEAT-0399: this used to be keyed by legacy alert id, joined in through
    // the origin ledger, because Manage listed `cachy_alerts_v1`. With that
    // store gone the list is the rule set itself.
    seed([ruleDoc({ id: "rule-a", valid_until_ms: NOW - 1 })]);

    const rows = alarmRows(NOW);

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("rule-a");
    expect(rows[0].status).toBe("expired");
  });

  it("lists a rule the panel armed, which the legacy list never showed", () => {
    // The gap FEAT-0399 closed: the panel has armed rules since FEAT-0389,
    // and those were never in `cachy_alerts_v1`, so Manage never showed them.
    seed([ruleDoc({ id: "panel-armed" })]);

    expect(alarmRows(NOW).map((r) => r.id)).toEqual(["panel-armed"]);
  });

  it("reads the fire count from the state store", () => {
    seed([ruleDoc({ id: "rule-a", valid_until_ms: NOW - 1 })]);
    localStorage.setItem(RULE_STATE_STORAGE_KEY, JSON.stringify({ "rule-a": { fired_count: 1 } }));

    expect(alarmRows(NOW)[0].status).toBe("fired");
  });

  it("is empty when no rule is stored", () => {
    seed([]);
    expect(alarmRows(NOW)).toEqual([]);
  });

  it("carries the threshold and comparison of a price rule", () => {
    seed([
      ruleDoc({
        id: "rule-a",
        conditions: {
          kind: "compare",
          left: { kind: "price" },
          op: "gte",
          right: { kind: "constant", value: "72000" },
          timeframe: "1m",
        } as unknown as RuleDocument["conditions"],
      }),
    ]);

    expect(alarmRows(NOW)[0]).toMatchObject({ op: "gte", threshold: "72000" });
  });

  it("still lists a rule whose conditions it cannot phrase", () => {
    // A trader who armed something this list has no wording for must still be
    // able to see and delete it. Hiding the row is the silence FEAT-0399 is
    // about.
    seed([ruleDoc({ id: "rule-a", conditions: { kind: "account" } as unknown as RuleDocument["conditions"] })]);

    const rows = alarmRows(NOW);

    expect(rows).toHaveLength(1);
    expect(rows[0].threshold).toBeUndefined();
  });

  it("reports a disabled rule as not enabled", () => {
    seed([ruleDoc({ id: "rule-a", enabled: false })]);
    expect(alarmRows(NOW)[0].enabled).toBe(false);
  });

  it("skips a malformed entry instead of dropping the whole list", () => {
    seed([null, ruleDoc({ id: "rule-a" })]);
    expect(alarmRows(NOW).map((r) => r.id)).toEqual(["rule-a"]);
  });

  /*
   * FEAT-0396 keeps bots in this same key as rules with
   * `consequence_level: "simulate"`, because a bot is an alarm that acts rather
   * than a second kind of thing. The surfaces are separate though: a bot listed
   * here would carry a delete button that removes a strategy from the tab meant
   * for alarms.
   */
  it("leaves a bot to the Automation tab", () => {
    seed([
      ruleDoc({ id: "alarm" }),
      ruleDoc({ id: "bot", action: { consequence_level: "simulate" } as RuleDocument["action"] }),
    ]);

    expect(alarmRows(NOW).map((r) => r.id)).toEqual(["alarm"]);
  });

  it("still lists a migrated alert, which carries no action at all", () => {
    // Why the filter asks whether a rule *is* a bot rather than whether it is a
    // `notify` rule: a rule the migration wrote has no `action`, so a positive
    // test would hide exactly the alarms FEAT-0399 set out to stop losing.
    seed([ruleDoc({ id: "migrated", action: undefined })]);

    expect(alarmRows(NOW).map((r) => r.id)).toEqual(["migrated"]);
  });
});
