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
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
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
