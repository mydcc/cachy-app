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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../logger", () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import {
  RULE_ORIGIN_STORAGE_KEY,
  RULE_ORIGIN_SCHEMA_VERSION,
  emptyLedger,
  readRuleOriginLedger,
  withRecordedOrigins,
  writeRuleOriginLedger,
  type RuleOriginLedger,
} from "./ruleOriginLedger";

const MIGRATED_AT = 1757068800000;

function ledgerWith(entries: RuleOriginLedger["entries"]): RuleOriginLedger {
  return { schema_version: RULE_ORIGIN_SCHEMA_VERSION, entries };
}

function storedLedger(): RuleOriginLedger {
  const raw = localStorage.getItem(RULE_ORIGIN_STORAGE_KEY);
  return raw ? JSON.parse(raw) : emptyLedger();
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("withRecordedOrigins", () => {
  it("records a rule that is not in the ledger yet", () => {
    const { ledger, added } = withRecordedOrigins(emptyLedger(), [
      { ruleId: "alert-active", entry: { alertId: "alert-active", migratedAtMs: MIGRATED_AT } },
    ]);

    expect(added).toBe(1);
    expect(ledger.entries["alert-active"]).toEqual({
      alertId: "alert-active",
      migratedAtMs: MIGRATED_AT,
    });
  });

  // The core safety property of FEAT-0401: an entry whose alert has since been
  // deleted IS the orphan record. Rewriting it would destroy the only evidence
  // that the rule was migrated rather than authored by hand.
  it("never rewrites an entry that already exists", () => {
    const existing = ledgerWith({
      "alert-active": { alertId: "alert-active", migratedAtMs: MIGRATED_AT },
    });

    const { ledger, added } = withRecordedOrigins(existing, [
      { ruleId: "alert-active", entry: { alertId: "somebody-else", migratedAtMs: 9999999999999 } },
    ]);

    expect(added).toBe(0);
    expect(ledger.entries["alert-active"]).toEqual({
      alertId: "alert-active",
      migratedAtMs: MIGRATED_AT,
    });
  });

  it("leaves the ledger it was given untouched", () => {
    const original = emptyLedger();

    withRecordedOrigins(original, [
      { ruleId: "alert-active", entry: { alertId: "alert-active", migratedAtMs: MIGRATED_AT } },
    ]);

    expect(original.entries).toEqual({});
  });

  it("skips a record with an empty rule id rather than keying the ledger on it", () => {
    const { ledger, added } = withRecordedOrigins(emptyLedger(), [
      { ruleId: "", entry: { alertId: "alert-active", migratedAtMs: MIGRATED_AT } },
    ]);

    expect(added).toBe(0);
    expect(Object.keys(ledger.entries)).toHaveLength(0);
  });

  it("adds several records in one merge and counts only the new ones", () => {
    const existing = ledgerWith({ a: { alertId: "a", migratedAtMs: MIGRATED_AT } });

    const { ledger, added } = withRecordedOrigins(existing, [
      { ruleId: "a", entry: { alertId: "a", migratedAtMs: MIGRATED_AT } },
      { ruleId: "b", entry: { alertId: "b", migratedAtMs: MIGRATED_AT } },
      { ruleId: "c", entry: { alertId: "c", migratedAtMs: MIGRATED_AT, backfilled: true } },
    ]);

    expect(added).toBe(2);
    expect(Object.keys(ledger.entries).sort()).toEqual(["a", "b", "c"]);
    expect(ledger.entries.c.backfilled).toBe(true);
  });
});

describe("readRuleOriginLedger", () => {
  it("returns an empty ledger when nothing is stored", () => {
    expect(readRuleOriginLedger()).toEqual(emptyLedger());
  });

  it("reads back what was written", () => {
    writeRuleOriginLedger(
      ledgerWith({ "alert-active": { alertId: "alert-active", migratedAtMs: MIGRATED_AT } }),
    );

    expect(readRuleOriginLedger().entries["alert-active"]).toEqual({
      alertId: "alert-active",
      migratedAtMs: MIGRATED_AT,
    });
  });

  it("treats unreadable JSON as empty instead of throwing", () => {
    localStorage.setItem(RULE_ORIGIN_STORAGE_KEY, "{not json");

    expect(readRuleOriginLedger()).toEqual(emptyLedger());
  });

  it("treats a structurally wrong file as empty", () => {
    localStorage.setItem(RULE_ORIGIN_STORAGE_KEY, JSON.stringify(["not", "an", "object"]));

    expect(readRuleOriginLedger()).toEqual(emptyLedger());
  });

  // One bad row must not cost every other rule its provenance — that would
  // silently reclassify migrated rules as hand-authored ones.
  it("keeps the valid entries and skips only the malformed ones", () => {
    localStorage.setItem(
      RULE_ORIGIN_STORAGE_KEY,
      JSON.stringify({
        schema_version: 1,
        entries: {
          good: { alertId: "good", migratedAtMs: MIGRATED_AT },
          "missing-alert-id": { migratedAtMs: MIGRATED_AT },
          "empty-alert-id": { alertId: "", migratedAtMs: MIGRATED_AT },
          "bad-timestamp": { alertId: "x", migratedAtMs: "yesterday" },
          "not-an-object": 42,
        },
      }),
    );

    const ledger = readRuleOriginLedger();

    expect(Object.keys(ledger.entries)).toEqual(["good"]);
    expect(ledger.entries.good.migratedAtMs).toBe(MIGRATED_AT);
  });

  it("preserves the backfilled marker so an approximate timestamp stays labelled", () => {
    writeRuleOriginLedger(
      ledgerWith({ r: { alertId: "a", migratedAtMs: MIGRATED_AT, backfilled: true } }),
    );

    expect(readRuleOriginLedger().entries.r.backfilled).toBe(true);
  });
});

describe("writeRuleOriginLedger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("persists the ledger and reports success", () => {
    const ok = writeRuleOriginLedger(
      ledgerWith({ r: { alertId: "a", migratedAtMs: MIGRATED_AT } }),
    );

    expect(ok).toBe(true);
    expect(storedLedger().entries.r.alertId).toBe("a");
  });

  // A full quota must cost the trader their bookkeeping, never the migration
  // that was running when it happened.
  it("reports failure instead of throwing when storage refuses the write", () => {
    // Spied on the instance, not `Storage.prototype`: the test environment
    // does not necessarily route `localStorage.setItem` through the prototype,
    // and a prototype spy then silently never fires — the write would succeed
    // and this test would pass without ever exercising the failure path.
    const setItem = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    expect(() =>
      writeRuleOriginLedger(ledgerWith({ r: { alertId: "a", migratedAtMs: MIGRATED_AT } })),
    ).not.toThrow();
    expect(setItem).toHaveBeenCalled();
    expect(writeRuleOriginLedger(emptyLedger())).toBe(false);
  });
});
