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

import {
  acknowledgeCutoverNotice,
  CUTOVER_NOTICE_STORAGE_KEY,
  shouldShowCutoverNotice,
} from "./cutoverNotice";
import { RULES_STORAGE_KEY } from "./migrateAlertsToRules";
import { RULE_ORIGIN_STORAGE_KEY } from "./ruleOriginLedger";

vi.mock("$app/environment", () => ({ browser: true, dev: false }));

vi.mock("../logger", () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// The notice depends on readCoveredAlertIds(), which reports nothing while the
// rule evaluator's core has not loaded — irrelevant to what this file tests.
vi.mock("../../lib/rules/ruleSchema", () => ({
  ruleSchema: { isReady: () => true },
}));

// shouldShowCutoverNotice() dynamically imports this for the real,
// market-store-backed series check. Stubbed to "yes" — this file tests the
// notice's own rules (only-if-affected, only-once), not series observation,
// which `ruleCoverage.test.ts` already covers.
vi.mock("./ruleLoopWiring", () => ({
  isSeriesObserved: () => true,
}));

function withCoveredAlert(): void {
  localStorage.setItem(
    RULES_STORAGE_KEY,
    JSON.stringify([{ id: "r1", symbol: "BTCUSDT", trigger_timeframe: "1m" }]),
  );
  localStorage.setItem(
    RULE_ORIGIN_STORAGE_KEY,
    JSON.stringify({
      schema_version: 1,
      entries: { r1: { alertId: "a1", migratedAtMs: 1_757_030_400_000 } },
    }),
  );
}

describe("cutover notice", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("is shown to a trader whose alerts the rule engine took over", async () => {
    withCoveredAlert();

    expect(await shouldShowCutoverNotice()).toBe(true);
  });

  it("is not shown to a trader with no covered alerts", async () => {
    expect(await shouldShowCutoverNotice()).toBe(false);
  });

  it("is not shown when the covering rule is disabled — nothing changed for them", async () => {
    withCoveredAlert();
    localStorage.setItem(
      RULES_STORAGE_KEY,
      JSON.stringify([{ id: "r1", symbol: "BTCUSDT", trigger_timeframe: "1m", enabled: false }]),
    );

    expect(await shouldShowCutoverNotice()).toBe(false);
  });

  it("is shown once and not again after acknowledgement", async () => {
    withCoveredAlert();
    expect(await shouldShowCutoverNotice()).toBe(true);

    acknowledgeCutoverNotice();

    expect(await shouldShowCutoverNotice()).toBe(false);
    expect(localStorage.getItem(CUTOVER_NOTICE_STORAGE_KEY)).not.toBeNull();
  });

  it("stays acknowledged even if the alert set changes later", async () => {
    withCoveredAlert();
    acknowledgeCutoverNotice();
    localStorage.setItem(
      RULES_STORAGE_KEY,
      JSON.stringify([
        { id: "r1", symbol: "BTCUSDT", trigger_timeframe: "1m" },
        { id: "r2", symbol: "ETHUSDT", trigger_timeframe: "1m" },
      ]),
    );

    expect(await shouldShowCutoverNotice()).toBe(false);
  });

  it("stays hidden when the rule store is unreadable", async () => {
    localStorage.setItem(RULES_STORAGE_KEY, "not json");

    expect(await shouldShowCutoverNotice()).toBe(false);
  });
});
