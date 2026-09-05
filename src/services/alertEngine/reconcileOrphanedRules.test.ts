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

import { describe, expect, it, vi } from "vitest";

import {
  reconcileOrphanedRules,
  type AlertStoreSnapshot,
} from "./reconcileOrphanedRules";
import type { RuleOriginLedger } from "./ruleOriginLedger";
import type { RuleDocument } from "../../lib/rules/types";

vi.mock("../logger", () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

/**
 * Only `id` and `enabled` are read by the reconciliation. Building a full
 * document here would couple these tests to every future schema field without
 * testing anything more.
 */
function rule(id: string, enabled = true): RuleDocument {
  return { id, enabled } as unknown as RuleDocument;
}

function ledgerFor(pairs: ReadonlyArray<[ruleId: string, alertId: string]>): RuleOriginLedger {
  return {
    schema_version: 1,
    entries: Object.fromEntries(
      pairs.map(([ruleId, alertId]) => [ruleId, { alertId, migratedAtMs: 1_757_030_400_000 }]),
    ),
  };
}

function store(ids: readonly string[], present = true): AlertStoreSnapshot {
  return { present, ids: new Set(ids) };
}

describe("reconcileOrphanedRules", () => {
  it("suspends a migrated rule whose source alert was deleted", () => {
    const rules = [rule("r1"), rule("r2"), rule("r3"), rule("r4")];
    const ledger = ledgerFor([
      ["r1", "a1"],
      ["r2", "a2"],
      ["r3", "a3"],
      ["r4", "a4"],
    ]);

    const result = reconcileOrphanedRules(rules, store(["a1", "a2", "a3"]), ledger);

    expect(result.suspended).toEqual(["r4"]);
    expect(result.withheld).toEqual([]);
    expect(result.rules.find((r) => r.id === "r4")?.enabled).toBe(false);
    expect(result.rules.find((r) => r.id === "r1")?.enabled).toBe(true);
  });

  it("never suspends a hand-authored rule, even with no matching alert", () => {
    const rules = [rule("authored")];

    const result = reconcileOrphanedRules(rules, store([]), ledgerFor([]));

    expect(result.suspended).toEqual([]);
    expect(result.rules[0].enabled).toBe(true);
  });

  it("does not mutate the rules it was given", () => {
    const original = rule("r1");
    const rules = [original, rule("r2"), rule("r3"), rule("r4")];
    const ledger = ledgerFor([
      ["r1", "a1"],
      ["r2", "a2"],
      ["r3", "a3"],
      ["r4", "a4"],
    ]);

    const result = reconcileOrphanedRules(rules, store(["a2", "a3", "a4"]), ledger);

    expect(result.suspended).toEqual(["r1"]);
    expect(original.enabled).toBe(true);
    expect(result.rules[0]).not.toBe(original);
  });

  it("leaves an already-disabled rule alone and out of the report", () => {
    const rules = [rule("r1", false), rule("r2"), rule("r3"), rule("r4"), rule("r5")];
    const ledger = ledgerFor([
      ["r1", "a1"],
      ["r2", "a2"],
      ["r3", "a3"],
      ["r4", "a4"],
      ["r5", "a5"],
    ]);

    // a1 and a5 are gone, but r1 was disabled by the trader themselves.
    const result = reconcileOrphanedRules(rules, store(["a2", "a3", "a4"]), ledger);

    expect(result.suspended).toEqual(["r5"]);
    expect(result.rules.find((r) => r.id === "r1")?.enabled).toBe(false);
  });

  describe("store-presence gate", () => {
    it("withholds every suspension when the alert store is missing", () => {
      const rules = [rule("r1"), rule("r2")];
      const ledger = ledgerFor([
        ["r1", "a1"],
        ["r2", "a2"],
      ]);

      const result = reconcileOrphanedRules(rules, store([], false), ledger);

      expect(result.suspended).toEqual([]);
      expect(result.withheld).toEqual(["r1", "r2"]);
      expect(result.withheldReason).toBe("alert-store-missing");
      expect(result.rules.every((r) => r.enabled === true)).toBe(true);
    });

    it("treats a present-but-empty store as real deletions, not as a lost store", () => {
      const rules = [rule("r1")];

      const result = reconcileOrphanedRules(rules, store([]), ledgerFor([["r1", "a1"]]));

      expect(result.suspended).toEqual(["r1"]);
      expect(result.withheldReason).toBeUndefined();
    });
  });

  describe("orphan-ratio gate", () => {
    it("suspends at exactly half, because the threshold is strictly greater", () => {
      const rules = [rule("r1"), rule("r2"), rule("r3"), rule("r4")];
      const ledger = ledgerFor([
        ["r1", "a1"],
        ["r2", "a2"],
        ["r3", "a3"],
        ["r4", "a4"],
      ]);

      const result = reconcileOrphanedRules(rules, store(["a1", "a2"]), ledger);

      expect(result.suspended).toEqual(["r3", "r4"]);
      expect(result.withheld).toEqual([]);
    });

    it("withholds one rule past half", () => {
      const rules = [rule("r1"), rule("r2"), rule("r3"), rule("r4")];
      const ledger = ledgerFor([
        ["r1", "a1"],
        ["r2", "a2"],
        ["r3", "a3"],
        ["r4", "a4"],
      ]);

      const result = reconcileOrphanedRules(rules, store(["a1"]), ledger);

      expect(result.suspended).toEqual([]);
      expect(result.withheld).toEqual(["r2", "r3", "r4"]);
      expect(result.withheldReason).toBe("orphan-ratio-exceeded");
    });

    it("does not apply below the minimum sample, where the ratio means nothing", () => {
      const rules = [rule("r1"), rule("r2"), rule("r3")];
      const ledger = ledgerFor([
        ["r1", "a1"],
        ["r2", "a2"],
        ["r3", "a3"],
      ]);

      // Two of three deleted is 67 % — an ordinary afternoon with three alerts.
      const result = reconcileOrphanedRules(rules, store(["a1"]), ledger);

      expect(result.suspended).toEqual(["r2", "r3"]);
      expect(result.withheld).toEqual([]);
    });

    it("counts only migrated, armed rules in the denominator", () => {
      // 4 migrated rules of which 3 are orphaned (> 1/2), plus 6 hand-authored
      // ones. Counting the authored rules would put the share at 3/10 and
      // suspend — the denominator has to exclude them.
      const rules = [
        rule("r1"),
        rule("r2"),
        rule("r3"),
        rule("r4"),
        ...Array.from({ length: 6 }, (_, i) => rule(`authored${i}`)),
      ];
      const ledger = ledgerFor([
        ["r1", "a1"],
        ["r2", "a2"],
        ["r3", "a3"],
        ["r4", "a4"],
      ]);

      const result = reconcileOrphanedRules(rules, store(["a1"]), ledger);

      expect(result.suspended).toEqual([]);
      expect(result.withheldReason).toBe("orphan-ratio-exceeded");
    });
  });

  describe("robustness", () => {
    it("returns the rules untouched when the ledger is unusable", () => {
      const rules = [rule("r1")];

      const result = reconcileOrphanedRules(
        rules,
        store([]),
        null as unknown as RuleOriginLedger,
      );

      expect(result.suspended).toEqual([]);
      expect(result.rules[0].enabled).toBe(true);
    });

    it("returns the rules untouched when the store snapshot is unusable", () => {
      const rules = [rule("r1")];

      const result = reconcileOrphanedRules(
        rules,
        {} as unknown as AlertStoreSnapshot,
        ledgerFor([["r1", "a1"]]),
      );

      expect(result.suspended).toEqual([]);
      expect(result.rules[0].enabled).toBe(true);
    });

    it("survives a malformed entry in the rule list", () => {
      const rules = [null as unknown as RuleDocument, rule("r1")];

      const result = reconcileOrphanedRules(rules, store([]), ledgerFor([["r1", "a1"]]));

      expect(result.suspended).toEqual(["r1"]);
      expect(result.rules).toHaveLength(2);
    });

    it("handles an empty rule list", () => {
      const result = reconcileOrphanedRules([], store([]), ledgerFor([]));

      expect(result.rules).toEqual([]);
      expect(result.suspended).toEqual([]);
      expect(result.withheld).toEqual([]);
    });
  });
});
