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

vi.mock("$app/environment", () => ({ browser: true, dev: false }));

import { LEGACY_HANDOFF_KEY, runLegacyHandoff } from "./legacyHandoff";
import {
  ALERTS_STORAGE_KEY,
  MIGRATED_LEDGER_KEY,
  RULES_STORAGE_KEY,
} from "./migrateAlertsToRules";
import { RULE_ORIGIN_STORAGE_KEY } from "./ruleOriginLedger";

const rule = (id: string, enabled: boolean) => ({
  id,
  schema_version: 1,
  symbol: "BTCUSDT",
  enabled,
  trigger_timeframe: "1m",
  conditions: { left: {}, op: "gte", right: { value: "50000" } },
});

/** A device mid-cutover: alert active, rule parked by `releaseCoverage`. */
function parkedDevice(): void {
  localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify([{ id: "a1", active: true }]));
  localStorage.setItem(MIGRATED_LEDGER_KEY, JSON.stringify(["a1"]));
  localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify([rule("r1", false)]));
  localStorage.setItem(
    RULE_ORIGIN_STORAGE_KEY,
    JSON.stringify({ schema_version: 1, entries: { r1: { alertId: "a1", migratedAtMs: 1 } } }),
  );
}

function storedRules(): { id: string; enabled: boolean }[] {
  return JSON.parse(localStorage.getItem(RULES_STORAGE_KEY) ?? "[]");
}

describe("runLegacyHandoff", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("re-arms a rule the cutover parked while its alert is still active", () => {
    parkedDevice();

    expect(runLegacyHandoff()).toEqual({ rearmed: ["r1"] });
    expect(storedRules()[0].enabled).toBe(true);
  });

  it("runs only once, so the trader can disable the rule afterwards", () => {
    parkedDevice();
    runLegacyHandoff();

    // The trader turns the alarm off in the panel.
    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify([rule("r1", false)]));

    expect(runLegacyHandoff()).toBeNull();
    expect(storedRules()[0].enabled).toBe(false);
  });

  it("marks itself done even when it finds nothing to re-arm", () => {
    localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify([]));
    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify([]));

    expect(runLegacyHandoff()).toEqual({ rearmed: [] });
    expect(localStorage.getItem(LEGACY_HANDOFF_KEY)).not.toBeNull();
  });

  it("leaves a rule the trader disabled while its alert was also inactive", () => {
    parkedDevice();
    localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify([{ id: "a1", active: false }]));

    expect(runLegacyHandoff()).toEqual({ rearmed: [] });
    expect(storedRules()[0].enabled).toBe(false);
  });

  it("never touches a rule the panel authored rather than the migration", () => {
    parkedDevice();
    localStorage.setItem(RULE_ORIGIN_STORAGE_KEY, JSON.stringify({ schema_version: 1, entries: {} }));

    expect(runLegacyHandoff()).toEqual({ rearmed: [] });
    expect(storedRules()[0].enabled).toBe(false);
  });

  it("never re-arms a rule whose alert the ledger does not know", () => {
    parkedDevice();
    localStorage.setItem(MIGRATED_LEDGER_KEY, JSON.stringify([]));

    expect(runLegacyHandoff()).toEqual({ rearmed: [] });
    expect(storedRules()[0].enabled).toBe(false);
  });

  it("leaves an already-armed rule alone", () => {
    parkedDevice();
    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify([rule("r1", true)]));

    expect(runLegacyHandoff()).toEqual({ rearmed: [] });
    expect(storedRules()[0].enabled).toBe(true);
  });

  it("stays retryable when the alert store cannot be read", () => {
    parkedDevice();
    localStorage.setItem(ALERTS_STORAGE_KEY, "{not json");

    expect(runLegacyHandoff()).toBeNull();
    // No marker: an unreadable store is not evidence that nothing needs doing.
    expect(localStorage.getItem(LEGACY_HANDOFF_KEY)).toBeNull();
  });

  it("stays retryable when the migration ledger cannot be read", () => {
    parkedDevice();
    localStorage.setItem(MIGRATED_LEDGER_KEY, "{not json");

    expect(runLegacyHandoff()).toBeNull();
    expect(localStorage.getItem(LEGACY_HANDOFF_KEY)).toBeNull();
  });

  it("writes nothing when there is nothing to re-arm", () => {
    localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify([{ id: "a1", active: true }]));
    localStorage.setItem(MIGRATED_LEDGER_KEY, JSON.stringify(["a1"]));
    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify([rule("r1", true)]));
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    runLegacyHandoff();

    const ruleWrites = setItem.mock.calls.filter((c) => c[0] === RULES_STORAGE_KEY);
    expect(ruleWrites).toHaveLength(0);
  });
});
