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
 *
 * Coverage requires three things to hold at once — core loaded, series
 * observed, sink notifying (the last is `alerts.svelte.ts`'s job, not this
 * module's) — because any one alone is not proof the rule path can produce a
 * verdict. `isObserved`/`isReady` default to "true" here so most tests read
 * as "given the preconditions hold, does the rule logic decide correctly";
 * the dedicated tests below flip one precondition at a time.
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

// Coverage is reported only once the rule evaluator's own core is loaded
// (a covered alert with a core that never loaded would be dropped from the
// legacy engine for an evaluator that will never run it). A `vi.fn()`, not a
// constant, so the one test about this gate can flip it; every other test in
// this file is unrelated to loading and leaves it at the default.
const isReady = vi.fn(() => true);
vi.mock("../../lib/rules/ruleSchema", () => ({
  ruleSchema: { isReady: () => isReady() },
}));

// The market-store-backed predicate this module deliberately has no import
// on. A `vi.fn()` so the series-observed tests can flip it per rule/symbol;
// every other test just needs "yes, something is watching this series".
const isObserved = vi.fn(() => true);

function storeRules(
  rules: ReadonlyArray<{
    id: string;
    symbol?: string;
    trigger_timeframe?: string;
    enabled?: boolean;
  }>,
): void {
  const withDefaults = rules.map((rule) => ({
    symbol: "BTCUSDT",
    trigger_timeframe: "1m",
    ...rule,
  }));
  localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(withDefaults));
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
    isReady.mockReturnValue(true);
    isObserved.mockReturnValue(true);
  });

  describe("readCoveredAlertIds", () => {
    it("covers nothing while the rule evaluator's core has not loaded", () => {
      // The gap a live session actually hit: the rule store names an armed
      // rule for this alert, but the evaluator that would run it never
      // finished loading. Reporting coverage here would drop the alert from
      // the legacy engine for an engine that will never evaluate it.
      isReady.mockReturnValue(false);
      storeRules([{ id: "r1" }]);
      storeLedger([["r1", "a1"]]);

      expect([...readCoveredAlertIds(isObserved)]).toEqual([]);
    });

    it("covers nothing while the rule's series is not observed", () => {
      // The other gap a live session found: an armed, core-ready rule whose
      // trigger-timeframe series the market store never subscribes to (e.g.
      // a 1m-pinned migrated rule on a symbol only ever charted at 4h) can
      // never produce a verdict, so it must not be taken off the legacy
      // engine either.
      isObserved.mockReturnValue(false);
      storeRules([{ id: "r1" }]);
      storeLedger([["r1", "a1"]]);

      expect([...readCoveredAlertIds(isObserved)]).toEqual([]);
    });

    it("asks whether the exact rule's symbol and trigger timeframe are observed", () => {
      storeRules([{ id: "r1", symbol: "ETHUSDT", trigger_timeframe: "5m" }]);
      storeLedger([["r1", "a1"]]);

      readCoveredAlertIds(isObserved);

      expect(isObserved).toHaveBeenCalledWith("ETHUSDT", "5m");
    });

    it("covers nothing by default — omitting the predicate is the safe state", () => {
      // No predicate supplied: the default assumes nothing is observed, so a
      // caller that forgets to wire the real market-store check gets "keep
      // everything on the legacy engine" rather than a silent gap.
      storeRules([{ id: "r1" }]);
      storeLedger([["r1", "a1"]]);

      expect([...readCoveredAlertIds()]).toEqual([]);
    });

    it("covers an alert whose migrated rule is armed", () => {
      storeRules([{ id: "r1" }]);
      storeLedger([["r1", "a1"]]);

      expect([...readCoveredAlertIds(isObserved)]).toEqual(["a1"]);
    });

    it("does not cover an alert whose rule is disabled", () => {
      storeRules([{ id: "r1", enabled: false }]);
      storeLedger([["r1", "a1"]]);

      expect([...readCoveredAlertIds(isObserved)]).toEqual([]);
    });

    it("does not cover an alert whose rule was deleted", () => {
      storeRules([]);
      storeLedger([["r1", "a1"]]);

      expect([...readCoveredAlertIds(isObserved)]).toEqual([]);
    });

    it("does not cover an alert that was never migrated", () => {
      storeRules([{ id: "r1" }]);
      storeLedger([]);

      expect([...readCoveredAlertIds(isObserved)]).toEqual([]);
    });

    it("covers nothing when the rule store is missing or unusable", () => {
      storeLedger([["r1", "a1"]]);
      expect([...readCoveredAlertIds(isObserved)]).toEqual([]);

      localStorage.setItem(RULES_STORAGE_KEY, "not json");
      expect([...readCoveredAlertIds(isObserved)]).toEqual([]);

      localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify({ not: "a list" }));
      expect([...readCoveredAlertIds(isObserved)]).toEqual([]);
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

      const covered = readCoveredAlertIds(isObserved);
      expect(alertsForLegacyEngine(alerts, covered).map((a) => a.id)).toEqual(["a2"]);
    });

    it("keeps every alert when nothing is covered", () => {
      expect(alertsForLegacyEngine(alerts).map((a) => a.id)).toEqual(["a1", "a2", "a3"]);
    });

    it("keeps an alert whose rule is disabled — no silent gap", () => {
      storeRules([{ id: "a1", enabled: false }]);
      storeLedger([["a1", "a1"]]);

      const covered = readCoveredAlertIds(isObserved);
      expect(alertsForLegacyEngine(alerts, covered).map((a) => a.id)).toContain("a1");
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
      expect(stored.map((r: { id: string; enabled?: boolean }) => ({ id: r.id, enabled: r.enabled }))).toEqual([
        { id: "r1", enabled: false },
        { id: "r2", enabled: undefined },
      ]);
      expect([...readCoveredAlertIds(isObserved)]).toEqual(["a2"]);
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
      expect(stored.map((r: { id: string; enabled?: boolean }) => ({ id: r.id, enabled: r.enabled }))).toEqual([
        { id: "r1", enabled: false },
        { id: "r2", enabled: undefined },
      ]);
    });

    it("reports the alert a rule came from, and nothing for an authored one", () => {
      storeLedger([["r1", "a1"]]);

      expect(originAlertIdOf("r1")).toBe("a1");
      expect(originAlertIdOf("authored")).toBeUndefined();
    });
  });
});
