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

// `safeLocalStorage` and every `browser`-guarded reader are no-ops in the
// `unit` project unless `$app/environment` says otherwise.
vi.mock("$app/environment", () => ({ browser: true, dev: false }));

import { reportLegacyMigrationState, verifyLegacyMigration } from "./verifyLegacyMigration";
import { ALERTS_STORAGE_KEY, MIGRATED_LEDGER_KEY } from "./migrateAlertsToRules";

function writeLegacy(entries: unknown[]): void {
  localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(entries));
}

function writeLedger(ids: string[]): void {
  localStorage.setItem(MIGRATED_LEDGER_KEY, JSON.stringify(ids));
}

const alert = (id: string) => ({ id, active: true, condition: { price_reached: "50000" } });

describe("verifyLegacyMigration", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("stays silent when the device never had a legacy alert store", () => {
    writeLedger(["a"]);

    expect(verifyLegacyMigration()).toBeNull();
  });

  it("reports clean when every legacy alert has a ledger entry", () => {
    writeLegacy([alert("a"), alert("b")]);
    writeLedger(["a", "b"]);

    expect(verifyLegacyMigration()).toEqual({
      verdict: "clean",
      legacyCount: 2,
      unmigrated: [],
      unidentifiable: 0,
    });
  });

  it("treats a ledger holding ids the store no longer has as clean", () => {
    // A trader deleted an alert after it migrated. The ledger is append-only
    // by design, so it outliving its alert is the normal case, not a finding.
    writeLegacy([alert("a")]);
    writeLedger(["a", "deleted-long-ago"]);

    expect(verifyLegacyMigration()?.verdict).toBe("clean");
  });

  it("names every legacy alert the migration never converted", () => {
    writeLegacy([alert("c"), alert("a"), alert("b")]);
    writeLedger(["b"]);

    const report = verifyLegacyMigration();

    expect(report?.verdict).toBe("unmigrated");
    expect(report?.unmigrated).toEqual(["a", "c"]);
    expect(report?.legacyCount).toBe(3);
  });

  it("reports an empty ledger next to a populated store as unmigrated, not unreadable", () => {
    // Nothing was ever migrated on this device. That is a real finding about
    // the data, not a failure to read it.
    writeLegacy([alert("a")]);

    expect(verifyLegacyMigration()).toMatchObject({
      verdict: "unmigrated",
      unmigrated: ["a"],
    });
  });

  it("reports an empty legacy list as clean", () => {
    writeLegacy([]);

    expect(verifyLegacyMigration()).toMatchObject({ verdict: "clean", legacyCount: 0 });
  });

  it("never reports an unparseable store as clean", () => {
    localStorage.setItem(ALERTS_STORAGE_KEY, "{not json");

    expect(verifyLegacyMigration()?.verdict).toBe("unreadable");
  });

  it("never reports a store that is not a list as clean", () => {
    localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify({ a: 1 }));

    expect(verifyLegacyMigration()?.verdict).toBe("unreadable");
  });

  it("never turns an unreadable ledger into a list of unmigrated ids", () => {
    // The dangerous shape: a parse error on the ledger would otherwise read
    // as "nothing was migrated" and condemn every alert the trader has.
    writeLegacy([alert("a"), alert("b")]);
    localStorage.setItem(MIGRATED_LEDGER_KEY, "{not json");

    const report = verifyLegacyMigration();

    expect(report?.verdict).toBe("unreadable");
    expect(report?.unmigrated).toEqual([]);
  });

  it("counts legacy entries carrying no id instead of calling them migrated", () => {
    writeLegacy([alert("a"), { active: true }, null]);
    writeLedger(["a"]);

    expect(verifyLegacyMigration()).toMatchObject({
      verdict: "clean",
      legacyCount: 3,
      unidentifiable: 2,
    });
  });

  it("returns the same report for the same storage", () => {
    writeLegacy([alert("z"), alert("y")]);
    writeLedger([]);

    expect(verifyLegacyMigration()).toEqual(verifyLegacyMigration());
  });
});

describe("reportLegacyMigrationState", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("logs nothing when there is no legacy store to verify", async () => {
    const { logger } = await import("../logger");
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const log = vi.spyOn(logger, "log").mockImplementation(() => {});

    expect(reportLegacyMigrationState()).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it("records a clean verification, so the safe case leaves evidence too", async () => {
    const { logger } = await import("../logger");
    const log = vi.spyOn(logger, "log").mockImplementation(() => {});
    writeLegacy([alert("a")]);
    writeLedger(["a"]);

    expect(reportLegacyMigrationState()?.verdict).toBe("clean");
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("warns with the ids a trader would otherwise lose silently", async () => {
    const { logger } = await import("../logger");
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    writeLegacy([alert("lost-alarm")]);
    writeLedger([]);

    reportLegacyMigrationState();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][1]).toContain("lost-alarm");
  });
});
