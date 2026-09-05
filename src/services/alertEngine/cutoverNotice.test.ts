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

function withCoveredAlert(): void {
  localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify([{ id: "r1" }]));
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

  it("is shown to a trader whose alerts the rule engine took over", () => {
    withCoveredAlert();

    expect(shouldShowCutoverNotice()).toBe(true);
  });

  it("is not shown to a trader with no covered alerts", () => {
    expect(shouldShowCutoverNotice()).toBe(false);
  });

  it("is not shown when the covering rule is disabled — nothing changed for them", () => {
    withCoveredAlert();
    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify([{ id: "r1", enabled: false }]));

    expect(shouldShowCutoverNotice()).toBe(false);
  });

  it("is shown once and not again after acknowledgement", () => {
    withCoveredAlert();
    expect(shouldShowCutoverNotice()).toBe(true);

    acknowledgeCutoverNotice();

    expect(shouldShowCutoverNotice()).toBe(false);
    expect(localStorage.getItem(CUTOVER_NOTICE_STORAGE_KEY)).not.toBeNull();
  });

  it("stays acknowledged even if the alert set changes later", () => {
    withCoveredAlert();
    acknowledgeCutoverNotice();
    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify([{ id: "r1" }, { id: "r2" }]));

    expect(shouldShowCutoverNotice()).toBe(false);
  });

  it("stays hidden when the rule store is unreadable", () => {
    localStorage.setItem(RULES_STORAGE_KEY, "not json");

    expect(shouldShowCutoverNotice()).toBe(false);
  });
});
