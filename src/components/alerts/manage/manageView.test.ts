/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
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
 * FEAT-0747 — the list's model without a component around it.
 *
 * The acceptance criteria this pins are the ones a template cannot prove:
 * filters compose with AND across groups, search reaches symbol, name and
 * note, sorting runs on derived rows, and the Log keeps announcements the
 * rule store no longer holds.
 */

import { describe, expect, it } from "vitest";

import type { AlarmRow } from "../../../services/alertEngine/ruleLifecycleView";
import type { ShadowFiringRecord } from "../../../services/alertEngine/shadowLedger";
import type { RuleDocument } from "../../../lib/rules/types";
import {
  buildFiringLog,
  buildManageRows,
  filterManageRows,
  kindOf,
  lastFiringByRule,
  matchesQuery,
  NO_FILTERS,
  sentenceFor,
  sortManageRows,
  timeframeOptions,
  type ManageRow,
} from "./manageView";

const translator = (key: string, values?: Record<string, unknown>) =>
  values ? `${key}|${JSON.stringify(values)}` : key;

function ruleDoc(overrides: Partial<RuleDocument> = {}): RuleDocument {
  return {
    schema_version: 2,
    id: "rule-a",
    name: "Support retest",
    symbol: "BTCUSDT",
    trigger_timeframe: "1h",
    conditions: {
      kind: "compare",
      left: { kind: "price" },
      op: "gte",
      right: { kind: "constant", value: "72000" },
      timeframe: "1h",
    },
    action: { consequence_level: "notify" },
    provenance: { source: "human", created_at_ms: 1 },
    ...overrides,
  };
}

function alarmRow(overrides: Partial<AlarmRow> = {}): AlarmRow {
  const rule = ruleDoc(overrides.rule as Partial<RuleDocument> | undefined);
  return {
    id: rule.id,
    symbol: rule.symbol,
    op: "gte",
    threshold: "72000",
    status: "armed",
    enabled: true,
    firedCount: 0,
    lastFiredAnchorMs: null,
    rule,
    ...overrides,
  };
}

function manageRow(overrides: Partial<ManageRow> = {}): ManageRow {
  const base = alarmRow(overrides);
  return {
    ...base,
    sentence: "BTCUSDT reaches 72000",
    kind: "price",
    timeframe: "1h",
    evaluation: "close",
    frequency: "once",
    validUntilMs: null,
    lastFiredAtMs: null,
    ...overrides,
  };
}

describe("kindOf", () => {
  it("calls a price comparison a price rule", () => {
    expect(kindOf(ruleDoc(), false)).toBe("price");
  });

  it("calls a comparison against an indicator an indicator rule", () => {
    expect(
      kindOf(
        ruleDoc({
          conditions: {
            kind: "compare",
            left: { kind: "indicator", indicator: { id: "rsi", params: { period: 14 } } },
            op: "gte",
            right: { kind: "constant", value: "70" },
            timeframe: "1h",
          },
        }),
        false,
      ),
    ).toBe("indicator");
  });

  it("calls a group a combo", () => {
    expect(
      kindOf(
        ruleDoc({
          conditions: { kind: "group", op: "all", of: [] },
        }),
        false,
      ),
    ).toBe("combo");
  });

  it("calls a pattern rule a pattern rule", () => {
    expect(
      kindOf(
        ruleDoc({ conditions: { kind: "pattern", pattern: "hammer", timeframe: "1h" } }),
        false,
      ),
    ).toBe("pattern");
  });

  it("prefers the drawing ledger over the condition shape", () => {
    expect(kindOf(ruleDoc(), true)).toBe("drawing");
  });

  it("answers unknown rather than throwing on a condition it cannot read", () => {
    expect(kindOf({ id: "x", conditions: { kind: "mystery" } as never }, false)).toBe("unknown");
  });
});

describe("sentenceFor", () => {
  it("phrases a price comparison", () => {
    expect(sentenceFor(ruleDoc(), translator)).toContain("rules.sentence.compare");
  });

  it("leaves a rule the renderer cannot phrase without a sentence", () => {
    expect(
      sentenceFor(
        { id: "x", conditions: { kind: "external_feed", feed: "x", op: "gt", value: "1" } as never },
        translator,
      ),
    ).toBe(null);
  });

  it("survives a malformed condition graph without taking the list down", () => {
    const broken = ruleDoc({ conditions: { kind: "group" } as never });

    expect(sentenceFor(broken, translator)).toBeNull();
  });
});

describe("buildManageRows", () => {
  it("prepares lifecycle defaults the way the core reads them", () => {
    const [row] = buildManageRows([alarmRow()], new Set(), translator, new Map());

    expect(row).toMatchObject({
      evaluation: "close",
      frequency: "once",
      timeframe: "1h",
      validUntilMs: null,
      lastFiredAtMs: null,
    });
  });

  it("keeps an intrabar rule and its expiry", () => {
    const [row] = buildManageRows(
      [alarmRow({ rule: ruleDoc({ evaluation_mode: "intrabar", valid_until_ms: 5_000 }) })],
      new Set(),
      translator,
      new Map(),
    );

    expect(row).toMatchObject({ evaluation: "intrabar", validUntilMs: 5_000 });
  });

  it("marks a rule from the drawing ledger as a drawing rule", () => {
    const [row] = buildManageRows(
      [alarmRow({ id: "drawn" })],
      new Set(["drawn"]),
      translator,
      new Map(),
    );

    expect(row.kind).toBe("drawing");
  });

  it("carries the last firing from the ledger", () => {
    const [row] = buildManageRows(
      [alarmRow({ id: "rule-a" })],
      new Set(),
      translator,
      new Map([["rule-a", 1_234]]),
    );

    expect(row.lastFiredAtMs).toBe(1_234);
  });
});

describe("matchesQuery", () => {
  const row = manageRow({ symbol: "ETHUSDT", note: "watch the retest" });

  it("matches the symbol case-insensitively", () => {
    expect(matchesQuery(row, "ethusdt")).toBe(true);
  });

  it("matches the rule name", () => {
    expect(matchesQuery(row, "support")).toBe(true);
  });

  it("matches the note", () => {
    expect(matchesQuery(row, "retest")).toBe(true);
  });

  it("does not match unrelated text", () => {
    expect(matchesQuery(row, "solana")).toBe(false);
  });

  it("matches everything when the query is blank", () => {
    expect(matchesQuery(row, "   ")).toBe(true);
  });

  it("survives a hand-edited non-string field", () => {
    const broken = manageRow({ symbol: 42 as unknown as string, rule: ruleDoc({ name: 7 as unknown as string }) });
    expect(() => matchesQuery(broken, "btc")).not.toThrow();
    expect(matchesQuery(broken, "btc")).toBe(false);
  });
});

describe("filterManageRows", () => {
  const armed = manageRow({ id: "a", status: "armed", kind: "price" });
  const suspended = manageRow({ id: "b", status: "suspended", kind: "indicator" });
  const rows = [armed, suspended];

  it("filters by one status", () => {
    expect(
      filterManageRows(rows, { ...NO_FILTERS, status: ["suspended"] }, "").map((r) => r.id),
    ).toEqual(["b"]);
  });

  it("treats several values inside one group as OR", () => {
    expect(
      filterManageRows(rows, { ...NO_FILTERS, status: ["armed", "suspended"] }, "").map((r) => r.id),
    ).toEqual(["a", "b"]);
  });

  it("composes groups with AND, keeping the row that satisfies both", () => {
    const armedIndicator = manageRow({ id: "c", status: "armed", kind: "indicator" });
    expect(
      filterManageRows([...rows, armedIndicator], { ...NO_FILTERS, status: ["armed"], kind: ["indicator"] }, ""),
    ).toEqual([armedIndicator]);
  });

  it("filters by the raw evaluation value", () => {
    const unknown = manageRow({ id: "unknown", evaluation: "tickwise" });
    const candidates = [...rows, unknown];

    expect(
      filterManageRows(candidates, { ...NO_FILTERS, evaluation: ["close"] }, "").map((r) => r.id),
    ).toEqual(["a", "b"]);
    expect(
      filterManageRows(candidates, { ...NO_FILTERS, evaluation: ["intrabar"] }, ""),
    ).toEqual([]);
  });

  it("has a positive case for the intrabar chip", () => {
    const intrabar = manageRow({ id: "i", evaluation: "intrabar" });
    const close = manageRow({ id: "c", evaluation: "close" });

    expect(
      filterManageRows([intrabar, close], { ...NO_FILTERS, evaluation: ["intrabar"] }, "").map(
        (r) => r.id,
      ),
    ).toEqual(["i"]);
  });

  it("filters by timeframe", () => {
    const hourly = manageRow({ id: "h", timeframe: "1h" });
    const daily = manageRow({ id: "d", timeframe: "1d" });

    expect(
      filterManageRows([hourly, daily], { ...NO_FILTERS, timeframe: ["1d"] }, "").map((r) => r.id),
    ).toEqual(["d"]);
  });

  it("composes the search with the filters", () => {
    expect(
      filterManageRows(rows, { ...NO_FILTERS, kind: ["price"] }, "nope"),
    ).toEqual([]);
  });
});

describe("sortManageRows", () => {
  const early = manageRow({
    id: "early",
    symbol: "BTCUSDT",
    lastFiredAtMs: 100,
    validUntilMs: 900,
  });
  const late = manageRow({ id: "late", symbol: "ETHUSDT", lastFiredAtMs: 300, validUntilMs: 100 });
  const never = manageRow({ id: "never", symbol: "ADAUSDT", lastFiredAtMs: null, validUntilMs: null });

  it("does not throw on a non-string symbol or id", () => {
    const broken = manageRow({
      id: 7 as unknown as string,
      symbol: 42 as unknown as string,
    });
    const ok = manageRow({ id: "ok", symbol: "BTCUSDT" });

    // Two rows: `sort` never calls the comparator for a single element, which
    // would make this test pass with the guard removed.
    expect(() => sortManageRows([broken, ok], "symbol")).not.toThrow();
    expect(sortManageRows([broken, ok], "symbol").map((row) => row.id)).toEqual([
      7,
      "ok",
    ]);
  });

  it("sorts by symbol", () => {
    expect(sortManageRows([late, never, early], "symbol").map((r) => r.id)).toEqual([
      "never",
      "early",
      "late",
    ]);
  });

  it("puts the most recent firing first and never-fired rows last", () => {
    expect(sortManageRows([never, early, late], "last-fired").map((r) => r.id)).toEqual([
      "late",
      "early",
      "never",
    ]);
  });

  it("sorts by expiry with open-ended rules last", () => {
    expect(sortManageRows([never, early, late], "expiry").map((r) => r.id)).toEqual([
      "late",
      "early",
      "never",
    ]);
  });

  it("does not mutate the input", () => {
    const rows = [late, early];
    sortManageRows(rows, "symbol");

    expect(rows.map((r) => r.id)).toEqual(["late", "early"]);
  });
});

describe("timeframeOptions", () => {
  it("deduplicates and sorts the timeframes in the list", () => {
    expect(
      timeframeOptions([
        manageRow({ id: "1", timeframe: "4h" }),
        manageRow({ id: "2", timeframe: "1h" }),
        manageRow({ id: "3", timeframe: "4h" }),
        manageRow({ id: "4", timeframe: "" }),
      ]),
    ).toEqual(["1h", "4h"]);
  });
});

function firingRecord(overrides: Partial<ShadowFiringRecord> = {}): ShadowFiringRecord {
  return {
    source: "rule",
    recordedAtMs: 1_000,
    symbol: "BTCUSDT",
    id: "rule-a",
    timeframe: "1h",
    anchorMs: 900,
    verdict: "Triggered",
    ...overrides,
  };
}

describe("lastFiringByRule", () => {
  it("keeps the newest rule record and ignores the shadow and legacy ones", () => {
    const latest = lastFiringByRule([
      firingRecord({ recordedAtMs: 100 }),
      firingRecord({ recordedAtMs: 300 }),
      firingRecord({ source: "shadow", recordedAtMs: 999 }),
      firingRecord({ source: "legacy", recordedAtMs: 999 }),
    ]);

    expect(latest.get("rule-a")).toBe(300);
  });
});

describe("buildFiringLog", () => {
  it("lists announcements newest first and drops shadow and legacy records", () => {
    const entries = buildFiringLog(
      [
        firingRecord({ recordedAtMs: 100, anchorMs: 90 }),
        firingRecord({ recordedAtMs: 300, anchorMs: 290 }),
        firingRecord({ source: "shadow", recordedAtMs: 500 }),
      ],
      [manageRow({ id: "rule-a" })],
    );

    expect(entries.map((entry) => entry.recordedAtMs)).toEqual([300, 100]);
  });

  it("keeps an entry after the rule was deleted and drops its name", () => {
    const entries = buildFiringLog([firingRecord()], []);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ ruleId: "rule-a", symbol: "BTCUSDT", ruleName: null });
  });

  it("adds a state-only entry for a fired rule the ledger never saw", () => {
    const entries = buildFiringLog(
      [],
      [manageRow({ id: "rule-a", firedCount: 2, lastFiredAnchorMs: 777 })],
    );

    expect(entries).toEqual([
      expect.objectContaining({ ruleId: "rule-a", recordedAtMs: null, anchorMs: 777 }),
    ]);
  });

  it("does not double-list a rule that already has a ledger entry", () => {
    const entries = buildFiringLog(
      [firingRecord()],
      [manageRow({ id: "rule-a", firedCount: 1, lastFiredAnchorMs: 900 })],
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].recordedAtMs).toBe(1_000);
  });

  it("caps the log at the ledger's own bound, keeping the newest", () => {
    const records = Array.from({ length: 520 }, (_, index) =>
      firingRecord({ recordedAtMs: index }),
    );

    const entries = buildFiringLog(records, []);

    expect(entries).toHaveLength(500);
    expect(entries[0].recordedAtMs).toBe(519);
    expect(entries.at(-1)?.recordedAtMs).toBe(20);
  });

  it("keeps a state-only fallback even when the ledger is at its cap", () => {
    const records = Array.from({ length: 500 }, (_, index) =>
      firingRecord({ id: `rule-${index}`, recordedAtMs: index }),
    );
    const fallback = manageRow({ id: "recovered", firedCount: 1, lastFiredAnchorMs: 42 });

    const entries = buildFiringLog(records, [fallback]);

    expect(entries).toHaveLength(501);
    expect(entries.at(-1)).toMatchObject({ ruleId: "recovered", recordedAtMs: null });
  });

  it("does not pretend a live bot was deleted", () => {
    // Bots fire through the same sink but are absent from `alarmRows`.
    const entries = buildFiringLog([firingRecord({ id: "bot-a" })], [], new Map([
      [
        "bot-a",
        { id: "bot-a", symbol: "BTCUSDT", timeframe: "1h", name: "Bot", firedCount: 0, lastFiredAnchorMs: null },
      ],
    ]));

    expect(entries[0]).toMatchObject({ ruleExists: true, ruleIsBot: true, ruleName: "Bot" });
  });

  it("recovers a bot fire the ledger never saw", () => {
    const entries = buildFiringLog([], [], new Map([
      [
        "bot-a",
        { id: "bot-a", symbol: "BTCUSDT", timeframe: "1h", name: "Bot", firedCount: 1, lastFiredAnchorMs: 777 },
      ],
    ]));

    expect(entries[0]).toMatchObject({ ruleId: "bot-a", recordedAtMs: null, ruleIsBot: true });
  });

  it("survives a non-string name and reports it as unnamed", () => {
    const entries = buildFiringLog(
      [firingRecord()],
      [manageRow({ id: "rule-a", rule: ruleDoc({ name: 7 as unknown as string }) })],
    );

    expect(entries[0]).toMatchObject({ ruleName: null, ruleExists: true });
  });

  it("survives a non-string name on the fallback path too", () => {
    const entries = buildFiringLog(
      [],
      [
        manageRow({
          id: "rule-a",
          firedCount: 1,
          lastFiredAnchorMs: 5,
          rule: ruleDoc({ name: 7 as unknown as string }),
        }),
      ],
    );

    expect(entries[0]).toMatchObject({ ruleName: null, ruleExists: true });
  });

  it("keeps an unnamed but existing rule distinguishable from a deleted one", () => {
    const entries = buildFiringLog(
      [firingRecord({ id: "nameless" })],
      [manageRow({ id: "nameless", rule: ruleDoc({ id: "nameless", name: "" }) })],
    );

    expect(entries[0]).toMatchObject({ ruleName: null, ruleExists: true });
  });
});
