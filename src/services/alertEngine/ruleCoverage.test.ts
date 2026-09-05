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
 * The cutover's safety property, stated as tests: every alert is evaluated by
 * exactly one engine. Never both (double fire), never neither (BUG-0382).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { RULES_STORAGE_KEY } from "./migrateAlertsToRules";
import {
  alertsForLegacyEngine,
  disarmRule,
  originAlertIdOf,
  readCoveredAlertIds,
  releaseCoverage,
} from "./ruleCoverage";
import { RULE_ORIGIN_STORAGE_KEY } from "./ruleOriginLedger";

vi.mock("$app/environment", () => ({ browser: true, dev: false }));

vi.mock("../logger", () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function storeRules(rules: ReadonlyArray<{ id: string; enabled?: boolean }>): void {
  localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(rules));
}

function storeLedger(pairs: ReadonlyArray<[ruleId: string, alertId: string]>): void {
  localStorage.setItem(
    RULE_ORIGIN_STORAGE_KEY,
    JSON.stringify({
      schema_version: 1,
      entries: Object.fromEntries(
        pairs.map(([ruleId, alertId]) => [ruleId, { alertId, migratedAtMs: 1_757_030_400_000 }]),
      ),
    }),
  );
}

describe("rule coverage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe("readCoveredAlertIds", () => {
    it("covers an alert whose migrated rule is armed", () => {
      storeRules([{ id: "r1" }]);
      storeLedger([["r1", "a1"]]);

      expect([...readCoveredAlertIds()]).toEqual(["a1"]);
    });

    it("does not cover an alert whose rule is disabled", () => {
      storeRules([{ id: "r1", enabled: false }]);
      storeLedger([["r1", "a1"]]);

      expect([...readCoveredAlertIds()]).toEqual([]);
    });

    it("does not cover an alert whose rule was deleted", () => {
      storeRules([]);
      storeLedger([["r1", "a1"]]);

      expect([...readCoveredAlertIds()]).toEqual([]);
    });

    it("does not cover an alert that was never migrated", () => {
      storeRules([{ id: "r1" }]);
      storeLedger([]);

      expect([...readCoveredAlertIds()]).toEqual([]);
    });

    it("covers nothing when the rule store is missing or unusable", () => {
      storeLedger([["r1", "a1"]]);
      expect([...readCoveredAlertIds()]).toEqual([]);

      localStorage.setItem(RULES_STORAGE_KEY, "not json");
      expect([...readCoveredAlertIds()]).toEqual([]);

      localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify({ not: "a list" }));
      expect([...readCoveredAlertIds()]).toEqual([]);
    });
  });

  describe("alertsForLegacyEngine", () => {
    const alerts = [{ id: "a1" }, { id: "a2" }, { id: "a3" }];

    it("removes exactly the covered alerts", () => {
      storeRules([{ id: "a1" }, { id: "a3" }]);
      storeLedger([
        ["a1", "a1"],
        ["a3", "a3"],
      ]);

      expect(alertsForLegacyEngine(alerts).map((a) => a.id)).toEqual(["a2"]);
    });

    it("keeps every alert when nothing is covered", () => {
      expect(alertsForLegacyEngine(alerts).map((a) => a.id)).toEqual(["a1", "a2", "a3"]);
    });

    it("keeps an alert whose rule is disabled — no silent gap", () => {
      storeRules([{ id: "a1", enabled: false }]);
      storeLedger([["a1", "a1"]]);

      expect(alertsForLegacyEngine(alerts).map((a) => a.id)).toContain("a1");
    });
  });

  describe("releaseCoverage", () => {
    it("disarms the rule so an edited alert cannot fire its old threshold", () => {
      storeRules([{ id: "r1" }, { id: "r2" }]);
      storeLedger([
        ["r1", "a1"],
        ["r2", "a2"],
      ]);

      expect(releaseCoverage("a1")).toBe(true);

      const stored = JSON.parse(localStorage.getItem(RULES_STORAGE_KEY) ?? "[]");
      expect(stored).toEqual([{ id: "r1", enabled: false }, { id: "r2" }]);
      expect([...readCoveredAlertIds()]).toEqual(["a2"]);
    });

    it("reports no change for an alert nothing covered", () => {
      storeRules([{ id: "r1" }]);
      storeLedger([["r1", "a1"]]);

      expect(releaseCoverage("a-unknown")).toBe(false);
    });

    it("reports no change when the rule was already disarmed", () => {
      storeRules([{ id: "r1", enabled: false }]);
      storeLedger([["r1", "a1"]]);

      expect(releaseCoverage("a1")).toBe(false);
    });
  });

  describe("disarmRule and originAlertIdOf", () => {
    it("disarms one rule and leaves the others alone", () => {
      storeRules([{ id: "r1" }, { id: "r2" }]);

      expect(disarmRule("r1")).toBe(true);

      const stored = JSON.parse(localStorage.getItem(RULES_STORAGE_KEY) ?? "[]");
      expect(stored).toEqual([{ id: "r1", enabled: false }, { id: "r2" }]);
    });

    it("reports the alert a rule came from, and nothing for an authored one", () => {
      storeLedger([["r1", "a1"]]);

      expect(originAlertIdOf("r1")).toBe("a1");
      expect(originAlertIdOf("authored")).toBeUndefined();
    });
  });
});
