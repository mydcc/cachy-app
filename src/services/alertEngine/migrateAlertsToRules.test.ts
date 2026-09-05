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

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("$app/environment", () => ({
  browser: true,
  dev: false,
  building: false,
  version: "0.0.1",
}));

vi.mock("../logger", () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const ALERTS_KEY = "cachy_alerts_v1";
const RULES_KEY = "cachy_rules_v1";

const ACTIVE_ALERT = {
  id: "alert-active",
  symbol: "BTCUSDT",
  condition: { price_reached: "50000.0" },
  active: true,
};

const FIRED_ALERT = {
  id: "alert-fired",
  symbol: "ETHUSDT",
  condition: { price_reached: "3000.0" },
  active: false,
};

/**
 * Stand-in for `rule_from_alert_json`, faithful to the real Rust conversion
 * (`technicals-wasm/src/rule/legacy.rs`) on the points these tests depend on:
 * `enabled` mirrors the alert's `active` flag, the schema version and symbol
 * carry over, and `action.consequence_level` is always "notify".
 */
function fakeRuleFromAlertJson(alertJson: string, timeframe: string, createdAtMs: number): string {
  const alert = JSON.parse(alertJson);
  if (!alert || typeof alert !== "object" || !alert.id || !alert.symbol || !alert.condition) {
    throw new Error("refused: malformed alert definition");
  }
  const [conditionKey, threshold] = Object.entries(alert.condition as Record<string, string>)[0];
  return JSON.stringify({
    schema_version: 1,
    id: alert.id,
    name: `${alert.symbol} ${conditionKey}`,
    symbol: alert.symbol,
    trigger_timeframe: timeframe,
    conditions: { type: "Cross", right: { value: threshold } },
    veto: null,
    action: { consequence_level: "notify", order: null },
    enabled: alert.active,
    provenance: { source: "human", created_at_ms: createdAtMs, model: null },
  });
}

const fakeLoader = vi.fn(async () => ({
  rule_from_alert_json: fakeRuleFromAlertJson,
}));

function readRules(): Array<Record<string, unknown>> {
  const raw = localStorage.getItem(RULES_KEY);
  return raw ? JSON.parse(raw) : [];
}

describe("FEAT-0388 — migrate stored price alerts to rule documents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("migrates a stored active alert into an enabled rule with matching symbol and threshold", async () => {
    localStorage.setItem(ALERTS_KEY, JSON.stringify([ACTIVE_ALERT]));
    const { migrateAlertsToRuleDocuments } = await import("./migrateAlertsToRules");

    await migrateAlertsToRuleDocuments(fakeLoader);

    const rules = readRules();
    expect(rules).toHaveLength(1);
    expect(rules[0].id).toBe(ACTIVE_ALERT.id);
    expect(rules[0].symbol).toBe(ACTIVE_ALERT.symbol);
    expect(rules[0].enabled).toBe(true);
    const conditions = rules[0].conditions as { right: { value: string } };
    expect(conditions.right.value).toBe("50000.0");
  });

  it("migrates a fired (inactive) alert as a disabled rule, not an armed one", async () => {
    localStorage.setItem(ALERTS_KEY, JSON.stringify([FIRED_ALERT]));
    const { migrateAlertsToRuleDocuments } = await import("./migrateAlertsToRules");

    await migrateAlertsToRuleDocuments(fakeLoader);

    const rules = readRules();
    expect(rules).toHaveLength(1);
    expect(rules[0].enabled).toBe(false);
  });

  it("never produces a rule with consequence_level above notify", async () => {
    localStorage.setItem(ALERTS_KEY, JSON.stringify([ACTIVE_ALERT, FIRED_ALERT]));
    const { migrateAlertsToRuleDocuments } = await import("./migrateAlertsToRules");

    await migrateAlertsToRuleDocuments(fakeLoader);

    const rules = readRules();
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      const action = rule.action as { consequence_level: string };
      expect(action.consequence_level).toBe("notify");
    }
  });

  it("running migration twice does not duplicate rules, and skips reloading the wasm module once nothing is pending", async () => {
    localStorage.setItem(ALERTS_KEY, JSON.stringify([ACTIVE_ALERT]));
    const { migrateAlertsToRuleDocuments } = await import("./migrateAlertsToRules");

    await migrateAlertsToRuleDocuments(fakeLoader);
    await migrateAlertsToRuleDocuments(fakeLoader);

    expect(readRules()).toHaveLength(1);
    expect(fakeLoader).toHaveBeenCalledTimes(1);
  });

  it("picks up an alert armed after an earlier migration run, without duplicating the one already migrated", async () => {
    localStorage.setItem(ALERTS_KEY, JSON.stringify([ACTIVE_ALERT]));
    const { migrateAlertsToRuleDocuments } = await import("./migrateAlertsToRules");
    await migrateAlertsToRuleDocuments(fakeLoader);
    expect(readRules()).toHaveLength(1);

    // A rule is not the only reader here in real life, but nothing else
    // touches cachy_alerts_v1 in this test — appending simulates the trader
    // arming a second alert after the app already migrated the first one.
    localStorage.setItem(ALERTS_KEY, JSON.stringify([ACTIVE_ALERT, FIRED_ALERT]));
    await migrateAlertsToRuleDocuments(fakeLoader);

    const rules = readRules();
    expect(rules).toHaveLength(2);
    expect(rules.map((r) => r.id).sort()).toEqual([ACTIVE_ALERT.id, FIRED_ALERT.id].sort());
    expect(fakeLoader).toHaveBeenCalledTimes(2);
  });

  it("skips a malformed entry, logs the reason, and still migrates the remaining valid ones", async () => {
    const { logger } = await import("../logger");
    const malformed = { symbol: "BTCUSDT" }; // missing id and condition
    localStorage.setItem(ALERTS_KEY, JSON.stringify([malformed, ACTIVE_ALERT]));
    const { migrateAlertsToRuleDocuments } = await import("./migrateAlertsToRules");

    await migrateAlertsToRuleDocuments(fakeLoader);

    const rules = readRules();
    expect(rules).toHaveLength(1);
    expect(rules[0].id).toBe(ACTIVE_ALERT.id);
    expect(logger.error).toHaveBeenCalledWith(
      "alerts",
      expect.stringContaining("Skipping malformed alert"),
      expect.anything(),
    );
  });

  it("leaves cachy_alerts_v1 untouched after migration", async () => {
    const rawAlerts = JSON.stringify([ACTIVE_ALERT, FIRED_ALERT]);
    localStorage.setItem(ALERTS_KEY, rawAlerts);
    const { migrateAlertsToRuleDocuments } = await import("./migrateAlertsToRules");

    await migrateAlertsToRuleDocuments(fakeLoader);

    expect(localStorage.getItem(ALERTS_KEY)).toBe(rawAlerts);
  });

  it("no-ops without touching the wasm module when there are no stored alerts", async () => {
    const { migrateAlertsToRuleDocuments } = await import("./migrateAlertsToRules");

    await migrateAlertsToRuleDocuments(fakeLoader);

    expect(fakeLoader).not.toHaveBeenCalled();
    expect(readRules()).toHaveLength(0);
  });

  it("migrates only the first of two stored alerts sharing an id, and logs the duplicate", async () => {
    const { logger } = await import("../logger");
    const duplicate = { ...ACTIVE_ALERT, symbol: "SOLUSDT" };
    localStorage.setItem(ALERTS_KEY, JSON.stringify([ACTIVE_ALERT, duplicate]));
    const { migrateAlertsToRuleDocuments } = await import("./migrateAlertsToRules");

    await migrateAlertsToRuleDocuments(fakeLoader);

    const rules = readRules();
    expect(rules).toHaveLength(1);
    expect(rules[0].symbol).toBe(ACTIVE_ALERT.symbol);
    expect(logger.debug).toHaveBeenCalledWith(
      "alerts",
      expect.stringContaining("duplicate id within cachy_alerts_v1"),
    );
  });

  it("disables an already-migrated rule when its alert fires after that first run, without duplicating or reloading wasm", async () => {
    localStorage.setItem(ALERTS_KEY, JSON.stringify([ACTIVE_ALERT]));
    const { migrateAlertsToRuleDocuments } = await import("./migrateAlertsToRules");
    await migrateAlertsToRuleDocuments(fakeLoader);
    expect(readRules()[0].enabled).toBe(true);

    // The trader's alert fires between runs — the shipped engine writes
    // active: false back to cachy_alerts_v1 for exactly this alert id.
    localStorage.setItem(ALERTS_KEY, JSON.stringify([{ ...ACTIVE_ALERT, active: false }]));
    await migrateAlertsToRuleDocuments(fakeLoader);

    const rules = readRules();
    expect(rules).toHaveLength(1);
    expect(rules[0].enabled).toBe(false);
    expect(fakeLoader).toHaveBeenCalledTimes(1);
  });

  it("syncs enabled to match an alert's active flag for a pre-existing same-id rule, and logs it, without reloading wasm", async () => {
    const { logger } = await import("../logger");
    localStorage.setItem(
      RULES_KEY,
      JSON.stringify([{ id: ACTIVE_ALERT.id, symbol: "PRESEEDED", enabled: false }]),
    );
    localStorage.setItem(ALERTS_KEY, JSON.stringify([ACTIVE_ALERT]));
    const { migrateAlertsToRuleDocuments } = await import("./migrateAlertsToRules");

    await migrateAlertsToRuleDocuments(fakeLoader);

    const rules = readRules();
    expect(rules).toHaveLength(1);
    expect(rules[0].symbol).toBe("PRESEEDED");
    expect(rules[0].enabled).toBe(true);
    expect(fakeLoader).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      "alerts",
      expect.stringContaining("Synced rule"),
    );
  });

  it("never throws, even when the wasm loader itself rejects", async () => {
    localStorage.setItem(ALERTS_KEY, JSON.stringify([ACTIVE_ALERT]));
    const { migrateAlertsToRuleDocuments } = await import("./migrateAlertsToRules");
    const failingLoader = vi.fn(async () => {
      throw new Error("wasm module failed to load");
    });

    await expect(migrateAlertsToRuleDocuments(failingLoader)).resolves.toBeUndefined();
    expect(readRules()).toHaveLength(0);
  });
});

const ORIGIN_KEY = "cachy_rule_origin_v1";

interface StoredLedger {
  schema_version: number;
  entries: Record<string, { alertId: string; migratedAtMs: number; backfilled?: true }>;
}

function readLedger(): StoredLedger {
  const raw = localStorage.getItem(ORIGIN_KEY);
  return raw ? JSON.parse(raw) : { schema_version: 0, entries: {} };
}

describe("FEAT-0401 — record a migration origin ledger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("records an entry for every rule it newly writes, in the same run", async () => {
    localStorage.setItem(ALERTS_KEY, JSON.stringify([ACTIVE_ALERT, FIRED_ALERT]));
    const { migrateAlertsToRuleDocuments } = await import("./migrateAlertsToRules");

    await migrateAlertsToRuleDocuments(fakeLoader);

    const ledger = readLedger();
    expect(Object.keys(ledger.entries).sort()).toEqual([ACTIVE_ALERT.id, FIRED_ALERT.id].sort());
    expect(ledger.entries[ACTIVE_ALERT.id].alertId).toBe(ACTIVE_ALERT.id);
    expect(ledger.entries[ACTIVE_ALERT.id].migratedAtMs).toBeGreaterThan(0);
    // Converted in this run, so the timestamp is measured, not inferred.
    expect(ledger.entries[ACTIVE_ALERT.id].backfilled).toBeUndefined();
  });

  it("back-fills a rule migrated before the ledger existed, while its alert is still there", async () => {
    localStorage.setItem(ALERTS_KEY, JSON.stringify([ACTIVE_ALERT]));
    localStorage.setItem(
      RULES_KEY,
      JSON.stringify([{ id: ACTIVE_ALERT.id, symbol: "BTCUSDT", enabled: true }]),
    );
    const { migrateAlertsToRuleDocuments } = await import("./migrateAlertsToRules");

    await migrateAlertsToRuleDocuments(fakeLoader);

    const entry = readLedger().entries[ACTIVE_ALERT.id];
    expect(entry.alertId).toBe(ACTIVE_ALERT.id);
    // Marked, because this run only noticed the link — it did not create it.
    expect(entry.backfilled).toBe(true);
    expect(fakeLoader).not.toHaveBeenCalled();
  });

  // The whole point of the ledger: once the alert is gone, this entry is the
  // only thing that still says the rule was migrated rather than hand-authored.
  it("keeps an entry after its alert is deleted, so the orphan stays provable", async () => {
    localStorage.setItem(ALERTS_KEY, JSON.stringify([ACTIVE_ALERT, FIRED_ALERT]));
    const { migrateAlertsToRuleDocuments } = await import("./migrateAlertsToRules");
    await migrateAlertsToRuleDocuments(fakeLoader);
    const before = readLedger().entries[ACTIVE_ALERT.id];

    // The trader deletes the alert; the migrated rule stays in cachy_rules_v1.
    localStorage.setItem(ALERTS_KEY, JSON.stringify([FIRED_ALERT]));
    await migrateAlertsToRuleDocuments(fakeLoader);

    expect(readLedger().entries[ACTIVE_ALERT.id]).toEqual(before);
  });

  it("leaves a directly authored rule out of the ledger entirely", async () => {
    localStorage.setItem(ALERTS_KEY, JSON.stringify([ACTIVE_ALERT]));
    localStorage.setItem(
      RULES_KEY,
      JSON.stringify([{ id: "hand-authored", symbol: "SOLUSDT", enabled: true }]),
    );
    const { migrateAlertsToRuleDocuments } = await import("./migrateAlertsToRules");

    await migrateAlertsToRuleDocuments(fakeLoader);

    const ledger = readLedger();
    expect(ledger.entries["hand-authored"]).toBeUndefined();
    expect(Object.keys(ledger.entries)).toEqual([ACTIVE_ALERT.id]);
    // ...and the rule itself is untouched by this item.
    const rules = readRules();
    expect(rules.find((r) => r.id === "hand-authored")).toEqual({
      id: "hand-authored",
      symbol: "SOLUSDT",
      enabled: true,
    });
  });

  it("rebuilds an unusable ledger instead of aborting the migration", async () => {
    localStorage.setItem(ALERTS_KEY, JSON.stringify([ACTIVE_ALERT]));
    localStorage.setItem(ORIGIN_KEY, "{not json");
    const { migrateAlertsToRuleDocuments } = await import("./migrateAlertsToRules");

    await expect(migrateAlertsToRuleDocuments(fakeLoader)).resolves.toBeUndefined();

    expect(readRules()).toHaveLength(1);
    expect(readLedger().entries[ACTIVE_ALERT.id].alertId).toBe(ACTIVE_ALERT.id);
  });

  // A ledger that cannot be written is lost bookkeeping. It must never be a
  // lost migration — the rules are what the trader's alarms depend on.
  it("still migrates the rules when the ledger write fails", async () => {
    localStorage.setItem(ALERTS_KEY, JSON.stringify([ACTIVE_ALERT]));
    // Mocked at the module seam rather than by spying on `localStorage`:
    // the test environment's Storage is proxy-backed, and an instance spy on
    // it can be swallowed as a stored item instead of intercepting the call.
    vi.doMock("./ruleOriginLedger", async () => {
      const actual =
        await vi.importActual<typeof import("./ruleOriginLedger")>("./ruleOriginLedger");
      return {
        ...actual,
        writeRuleOriginLedger: vi.fn(() => {
          throw new Error("QuotaExceededError");
        }),
      };
    });
    vi.resetModules();

    try {
      const { migrateAlertsToRuleDocuments } = await import("./migrateAlertsToRules");

      await expect(migrateAlertsToRuleDocuments(fakeLoader)).resolves.toBeUndefined();

      // Rules are written before the ledger is touched, so a ledger failure
      // costs the trader bookkeeping — never the alarms themselves.
      expect(readRules()).toHaveLength(1);
      expect(localStorage.getItem(ORIGIN_KEY)).toBeNull();
    } finally {
      vi.doUnmock("./ruleOriginLedger");
      vi.resetModules();
    }
  });
});
