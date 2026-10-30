// @vitest-environment happy-dom
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
 * FEAT-0389 -- "Manage lists armed rules and history with the same behaviour
 * as the current modal".
 *
 * The modal this tab replaced is deleted, so the old behaviour cannot be
 * diffed against a running component any more -- it has to be written down.
 * What it did, and what these tests hold this tab to: an armed alert appears
 * under Active and nowhere else, a fired one appears under History with its
 * fired badge, either can be deleted from its row, and an empty list says so
 * instead of rendering nothing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import en from "../../../locales/locales/en.json";
import ManageTab from "./ManageTab.svelte";
import { alertState, notifyingRuleSink } from "../../../stores/alerts.svelte";
import { alertPanelState } from "../../../stores/alertPanel.svelte";
import { uiState } from "../../../stores/ui.svelte";
import * as ruleActions from "../../../services/alertEngine/ruleActions";
import type { Condition, RuleDocument } from "../../../lib/rules/types";

// The cutover notice reads localStorage behind a promise and is FEAT-0388's
// concern, not this tab's list behaviour. Answering "no" keeps its banner out
// of the markup these assertions read.
vi.mock("../../../services/alertEngine/cutoverNotice", () => ({
  shouldShowCutoverNotice: () => Promise.resolve(false),
  acknowledgeCutoverNotice: vi.fn(),
}));

const dictionary = en as Record<string, unknown>;

function getNestedTranslation(
  path: string,
  options?: { values?: Record<string, unknown> },
): string {
  let current: unknown = dictionary;
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object") return path;
    current = (current as Record<string, unknown>)[part];
  }
  if (typeof current !== "string") return path;
  if (!options?.values) return current;
  return Object.entries(options.values).reduce(
    (acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, "g"), String(v)),
    current,
  );
}

vi.mock("../../../locales/i18n", () => {
  const translate = (key: string, options?: { values?: Record<string, unknown> }) =>
    getNestedTranslation(key, options);
  return {
    _: {
      subscribe: (fn: (val: typeof translate) => void) => {
        fn(translate);
        return () => {};
      },
    },
    locale: {
      subscribe: (fn: (val: string) => void) => {
        fn("en");
        return () => {};
      },
    },
  };
});

const RULES_KEY = "cachy_rules_v1";
const RULE_STATE_KEY = "cachy_rule_state_v1";

/**
 * FEAT-0399: the list is seeded through `cachy_rules_v1` now, not through
 * `alertState.definitions`. That store is gone, and with it the gap it caused
 * -- the panel has armed rules since FEAT-0389, so an alarm armed there was
 * never in the legacy store and never appeared in this list at all.
 */
function rule(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 2,
    id: "rule-1",
    symbol: "BTCUSDT",
    trigger_timeframe: "1m",
    enabled: true,
    conditions: {
      kind: "compare",
      left: { kind: "price" },
      op: "gt",
      right: { kind: "constant", value: "70000" },
      timeframe: "1m",
    },
    action: { consequence_level: "notify" },
    provenance: { source: "human", created_at_ms: 1 },
    ...overrides,
  };
}

/** A price-crossing rule the price builder can own. */
const PRICE_CROSS: Condition = {
  kind: "cross",
  left: { kind: "price", field: "close" },
  direction: "above",
  right: { kind: "constant", value: "70000" },
  timeframe: "1m",
};

function seedRules(rules: unknown[], firedCounts: Record<string, number> = {}) {
  localStorage.setItem(RULES_KEY, JSON.stringify(rules));
  localStorage.setItem(
    RULE_STATE_KEY,
    JSON.stringify(
      Object.fromEntries(Object.entries(firedCounts).map(([id, n]) => [id, { fired_count: n }])),
    ),
  );
  alertState.rulesVersion += 1;
}

describe("FEAT-0389: ManageTab keeps the old modal's list behaviour", () => {
  let target: HTMLElement;
  let component: ReturnType<typeof mount> | null = null;

  beforeEach(() => {
    target = document.createElement("div");
    document.body.appendChild(target);
    localStorage.clear();
    alertState.orphanReport = null;
    alertState.legacyMigrationReport = null;
    alertState.drawingReport = null;
    alertState.unevaluableReport = [];
    alertPanelState.closePanel();
    alertPanelState.reset("BTCUSDT");
    alertPanelState.activeTab = "manage";
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (component) unmount(component);
    component = null;
    target.remove();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  function render() {
    component = mount(ManageTab, { target, props: { symbol: "BTCUSDT" } });
    flushSync();
    return target;
  }

  /** The tab strip's two buttons, in render order: Alerts, then Log. */
  function listTabs(el: HTMLElement) {
    return Array.from(el.querySelectorAll<HTMLButtonElement>("[role='tab']"));
  }

  it("lists an armed alert under Alerts with its symbol and sentence", () => {
    seedRules([
      rule({
        symbol: "ETHUSDT",
        conditions: {
          kind: "compare",
          left: { kind: "price" },
          op: "gt",
          right: { kind: "constant", value: "4200" },
          timeframe: "1m",
        },
      }),
    ]);

    const el = render();
    const rows = el.querySelectorAll(".alert-item");

    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("ETHUSDT");
    expect(rows[0].textContent).toContain("4200");
    expect(rows[0].querySelector(".status-armed")?.textContent?.trim()).toBe(
      en.dashboard.alerts.manageList.status.armed,
    );
  });

  it("counts the visible alerts in the tab label", () => {
    seedRules([rule({ id: "one" }), rule({ id: "two", symbol: "ETHUSDT" })]);

    const el = render();
    const [alertsTab] = listTabs(el);

    expect(alertsTab.textContent?.trim()).toBe(
      en.dashboard.alerts.manageList.tabAlerts.replace("{count}", "2"),
    );
  });

  it("keeps a once rule that fired visible with its Fired status", () => {
    seedRules([rule({ id: "spent", symbol: "SOLUSDT", enabled: false })], { spent: 1 });

    const el = render();

    const row = el.querySelector(".alert-item");
    expect(row?.textContent).toContain("SOLUSDT");
    expect(row?.querySelector(".status-fired")).not.toBeNull();
  });

  it("searches symbol, name and note and says when nothing matches", () => {
    seedRules([
      rule({ id: "btc", symbol: "BTCUSDT", name: "Breakout" }),
      rule({ id: "eth", symbol: "ETHUSDT", name: "Retest", note: "watch the level" }),
    ]);

    const el = render();
    const search = el.querySelector<HTMLInputElement>("input[type='search']");

    search!.value = "retest";
    search!.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();

    expect(el.querySelectorAll(".alert-item")).toHaveLength(1);
    expect(el.textContent).toContain("ETHUSDT");
    expect(listTabs(el)[0].textContent?.trim()).toBe(
      en.dashboard.alerts.manageList.tabAlerts.replace("{count}", "1"),
    );

    search!.value = "solana";
    search!.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();

    expect(el.querySelectorAll(".alert-item")).toHaveLength(0);
    expect(el.querySelector(".empty-state")?.textContent?.trim()).toBe(
      en.dashboard.alerts.manageList.noMatches,
    );
  });

  it("filters by a status chip and exposes its pressed state", () => {
    seedRules(
      [rule({ id: "armed" }), rule({ id: "paused", symbol: "ETHUSDT", enabled: false })],
      {},
    );

    const el = render();
    const suspended = Array.from(el.querySelectorAll<HTMLButtonElement>(".chip")).find(
      (chip) => chip.textContent?.trim() === en.dashboard.alerts.suspended,
    );

    expect(suspended?.getAttribute("aria-pressed")).toBe("false");
    suspended!.click();
    flushSync();

    expect(suspended?.getAttribute("aria-pressed")).toBe("true");
    expect(el.querySelectorAll(".alert-item")).toHaveLength(1);
    expect(el.textContent).toContain("ETHUSDT");
  });

  it("ORs chips inside one group and clears them", () => {
    seedRules(
      [rule({ id: "armed" }), rule({ id: "paused", symbol: "ETHUSDT", enabled: false })],
      {},
    );

    const el = render();
    const chip = (label: string) =>
      Array.from(el.querySelectorAll<HTMLButtonElement>(".chip")).find(
        (candidate) => candidate.textContent?.trim() === label,
      )!;

    chip(en.dashboard.alerts.manageList.status.armed).click();
    flushSync();
    chip(en.dashboard.alerts.suspended).click();
    flushSync();

    expect(el.querySelectorAll(".alert-item")).toHaveLength(2);

    (el.querySelector(".clear") as HTMLButtonElement).click();
    flushSync();

    expect(el.querySelectorAll(".alert-item")).toHaveLength(2);
    expect(chip(en.dashboard.alerts.manageList.status.armed).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("sorts through the select, not only in the model", () => {
    seedRules([
      rule({ id: "btc", symbol: "BTCUSDT", valid_until_ms: 2_000_000_000_000 }),
      rule({ id: "eth", symbol: "ETHUSDT", valid_until_ms: 1_900_000_000_000 }),
    ]);

    const el = render();
    const select = el.querySelector<HTMLSelectElement>(".sort select");
    if (!select) throw new Error("no sort select");

    expect(el.querySelector(".alert-item strong")?.textContent).toBe("BTCUSDT");

    select.value = "expiry";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();

    expect(el.querySelector(".alert-item strong")?.textContent).toBe("ETHUSDT");
  });

  it("says the list is empty rather than rendering an empty box", () => {
    const el = render();

    expect(el.querySelector(".empty-state")?.textContent?.trim()).toBe(
      en.dashboard.alerts.manageList.emptyAlerts,
    );
  });

  it("deletes the alarm its row names, not the first one in the list", () => {
    seedRules([rule({ id: "keep", symbol: "BTCUSDT" }), rule({ id: "drop", symbol: "ETHUSDT" })]);

    const el = render();
    const rows = Array.from(el.querySelectorAll(".alert-item"));
    const ethRow = rows.find((r) => r.textContent?.includes("ETHUSDT"));

    (ethRow?.querySelector(".delete-btn") as HTMLButtonElement).click();
    flushSync();

    expect(JSON.parse(localStorage.getItem(RULES_KEY)!).map((r: { id: string }) => r.id)).toEqual([
      "keep",
    ]);
  });

  it("FEAT-0029: reports drawing alerts disabled for a deleted drawing", () => {
    alertState.drawingReport = { rules: [], suspended: ["rule-1"], withheld: [] };

    const el = render();

    expect(el.textContent).toContain(
      getNestedTranslation("dashboard.alerts.drawingSuspendedHint", { values: { count: 1 } }),
    );
  });

  it("FEAT-0029: reports drawing alerts left armed when the store proved nothing", () => {
    alertState.drawingReport = { rules: [], suspended: [], withheld: ["rule-2"] };

    const el = render();
    const banner = el.querySelector('[role="alert"]');

    expect(banner?.textContent).toContain(
      getNestedTranslation("dashboard.alerts.drawingWithheldHint", { values: { count: 1 } }),
    );
  });

  it("BUG-0485: marks a rule the engine found inert next to its row, and no other", () => {
    seedRules([
      rule({ id: "broken", symbol: "BTCUSDT" }),
      rule({ id: "fine", symbol: "ETHUSDT" }),
    ]);
    alertState.unevaluableReport = [
      { ruleId: "broken", name: "RSI oversold", symbol: "BTCUSDT", reason: "the drawing is gone" },
    ];

    const el = render();
    const rows = Array.from(el.querySelectorAll(".alert-item"));
    expect(rows).toHaveLength(2);

    const brokenRow = rows.find((r) => r.textContent?.includes("BTCUSDT"));
    expect(brokenRow?.querySelector(".broken-badge")?.textContent?.trim()).toBe(
      getNestedTranslation("dashboard.alerts.brokenRule.badge"),
    );

    const fineRow = rows.find((r) => r.textContent?.includes("ETHUSDT"));
    expect(fineRow?.querySelector(".broken-badge")).toBeNull();
  });

  it("FEAT-0542: the pencil loads that row's rule, keeps focus in the panel and toasts nothing", () => {
    seedRules([
      rule({
        id: "keep",
        symbol: "BTCUSDT",
        conditions: {
          kind: "cross",
          left: { kind: "price", field: "close" },
          direction: "above",
          right: { kind: "constant", value: "70000" },
          timeframe: "1m",
        },
      }),
      rule({
        id: "drop",
        symbol: "ETHUSDT",
        conditions: {
          kind: "cross",
          left: { kind: "price", field: "close" },
          direction: "above",
          right: { kind: "constant", value: "4200" },
          timeframe: "1m",
        },
      }),
    ]);

    const el = render();
    const panel = document.createElement("div");
    panel.id = "alert-tab-panel";
    panel.tabIndex = -1;
    target.appendChild(panel);

    const rows = [...el.querySelectorAll(".alert-item")];
    const ethRow = rows.find((r) => r.textContent?.includes("ETHUSDT"));
    const edit = ethRow?.querySelector<HTMLButtonElement>(".edit-btn");

    expect(edit).not.toBeNull();
    expect(edit?.getAttribute("aria-label")).toBe(en.dashboard.alerts.editAlert);
    expect(edit?.tagName).toBe("BUTTON");

    edit!.focus();
    expect(document.activeElement).toBe(edit);

    const toast = vi.spyOn(uiState, "showToast");
    edit!.click();
    flushSync();

    // The ETH row, not the first row: a pencil hoisted above the {#each}
    // would load "keep" and pass a single-row test.
    expect(alertPanelState.draft.id).toBe("drop");
    expect(alertPanelState.activeTab).toBe("price");
    expect(document.activeElement).toBe(panel);
    expect(toast).not.toHaveBeenCalled();
  });

  it("FEAT-0542: reports the rule vanished when it is deleted after render", () => {
    seedRules([rule()]);
    const el = render();
    const toast = vi.spyOn(uiState, "showToast");

    localStorage.removeItem(RULES_KEY);
    (el.querySelector(".edit-btn") as HTMLButtonElement).click();
    flushSync();

    expect(toast).toHaveBeenCalledWith(en.dashboard.alerts.editMissing, "error");
  });

  it("FEAT-0542: reports stored data it cannot read", () => {
    seedRules([rule()]);
    const el = render();
    const toast = vi.spyOn(uiState, "showToast");

    localStorage.setItem(RULES_KEY, "{not json");
    (el.querySelector(".edit-btn") as HTMLButtonElement).click();
    flushSync();

    expect(toast).toHaveBeenCalledWith(en.dashboard.alerts.editUnreadable, "error");
  });

  it("FEAT-0542: says a bot is not editable here", () => {
    seedRules([rule()]);
    const el = render();
    vi.spyOn(alertPanelState, "loadForEdit").mockReturnValue("bot");
    const toast = vi.spyOn(uiState, "showToast");

    (el.querySelector(".edit-btn") as HTMLButtonElement).click();
    flushSync();

    expect(toast).toHaveBeenCalledWith(
      en.dashboard.alerts.editNotEditable,
      "error",
    );
  });

  /** Opens the first row's native disclosure and proves it really expanded. */
  function expandFirstRow(el: HTMLElement): HTMLDetailsElement {
    const details = el.querySelector<HTMLDetailsElement>(".row-details");
    expect(details).not.toBeNull();
    expect(details!.tagName).toBe("DETAILS");
    expect(details!.open).toBe(false);
    (details!.querySelector("summary") as HTMLElement).click();
    flushSync();
    expect(details!.open).toBe(true);
    return details!;
  }

  /** Every `dt` with its `dd`, so a test asserts values rather than substrings. */
  function detailPairs(details: HTMLElement): Record<string, string> {
    const pairs: Record<string, string> = {};
    for (const dt of details.querySelectorAll("dt")) {
      pairs[dt.textContent?.trim() ?? ""] = (
        dt.nextElementSibling?.textContent ?? ""
      ).trim();
    }
    return pairs;
  }

  it("FEAT-0543: expands an indicator row to its full configuration", () => {
    seedRules([
      rule({
        conditions: {
          kind: "compare",
          left: {
            kind: "indicator",
            indicator: { id: "rsi", params: { period: 14 } },
          },
          op: "gt",
          right: { kind: "constant", value: "70" },
          timeframe: "1m",
        },
        frequency: "every_time",
        valid_until_ms: Date.parse("2030-01-01T12:00:00Z"),
        trigger_methods: ["sound"],
        note: "watch the level",
      }),
    ]);

    const details = expandFirstRow(render());
    const pairs = detailPairs(details);

    // The flat header could only print a compare's constant, with price
    // words; it never named the indicator. The detail reads the stored rule.
    expect(details.textContent).toContain("RSI(14)");
    expect(pairs.Timeframe).toBe("1m");
    expect(pairs.Evaluation).toBe(
      en.dashboard.alerts.panel.evaluationModeOption.close,
    );
    expect(pairs.Frequency).toBe(
      en.dashboard.alerts.panel.lifecycle.frequencyOption.every_time,
    );
    expect(pairs.Channels).toBe(
      en.dashboard.alerts.panel.lifecycle.methodOption.sound,
    );
    expect(pairs.Note).toBe("watch the level");
    expect(pairs[en.dashboard.alerts.panel.lifecycle.validUntil]).toContain(
      "2030",
    );
    expect(Object.keys(pairs)).toEqual([
      en.dashboard.alerts.panel.timeframe,
      en.dashboard.alerts.panel.evaluationMode,
      en.dashboard.alerts.panel.lifecycle.frequency,
      en.dashboard.alerts.panel.lifecycle.validUntil,
      en.common.channels,
      en.dashboard.alerts.panel.lifecycle.note,
    ]);
  });

  it("FEAT-0543: shows the intrabar evaluation mode", () => {
    seedRules([
      rule({ conditions: PRICE_CROSS, evaluation_mode: "intrabar" }),
    ]);

    const pairs = detailPairs(expandFirstRow(render()));

    expect(pairs[en.dashboard.alerts.panel.evaluationMode]).toBe(
      en.dashboard.alerts.panel.evaluationModeOption.intrabar,
    );
  });

  it("FEAT-0543: shows every leg of a combo with the sentence's joining word", () => {
    const rsi: Condition = {
      kind: "compare",
      left: { kind: "indicator", indicator: { id: "rsi", params: { period: 14 } } },
      op: "gt",
      right: { kind: "constant", value: "70" },
      timeframe: "1m",
    };
    const ema: Condition = {
      kind: "cross",
      left: { kind: "indicator", indicator: { id: "ema", params: { period: 9 } } },
      direction: "above",
      right: { kind: "indicator", indicator: { id: "ema", params: { period: 21 } } },
      timeframe: "1m",
    };
    seedRules([rule({ conditions: { kind: "group", op: "all", of: [rsi, ema] } })]);

    const text = expandFirstRow(render()).textContent ?? "";

    expect(text).toContain("RSI(14)");
    expect(text).toContain("EMA(9)");
    expect(text).toContain("EMA(21)");
    // Not just "and" somewhere in the prose: the two legs must be joined by
    // the same word the footer sentence uses.
    expect(text).toMatch(/RSI\(14\).*and.*EMA\(9\)/s);
  });

  it("FEAT-0543: shows a candlestick pattern by its name", () => {
    seedRules([
      rule({ conditions: { kind: "pattern", pattern: "hammer", timeframe: "1m" } }),
    ]);

    const text = expandFirstRow(render()).textContent ?? "";

    expect(text).toContain("Hammer");
  });

  it("FEAT-0543: omits optional fields instead of printing placeholders", () => {
    seedRules([rule({ conditions: PRICE_CROSS })]);

    const pairs = detailPairs(expandFirstRow(render()));

    expect(pairs[en.dashboard.alerts.panel.timeframe]).toBe("1m");
    expect(pairs[en.dashboard.alerts.panel.lifecycle.frequency]).toBe(
      en.dashboard.alerts.panel.lifecycle.frequencyOption.once,
    );
    expect(pairs[en.dashboard.alerts.panel.lifecycle.validUntil]).toBeUndefined();
    expect(pairs[en.common.channels]).toBeUndefined();
    expect(pairs[en.dashboard.alerts.panel.lifecycle.note]).toBeUndefined();
  });

  it("FEAT-0543: expands the row it belongs to, not a shared detail", () => {
    seedRules([
      rule({ id: "btc", symbol: "BTCUSDT", conditions: PRICE_CROSS }),
      rule({
        id: "eth",
        symbol: "ETHUSDT",
        conditions: {
          ...PRICE_CROSS,
          right: { kind: "constant", value: "4200" },
        },
      }),
    ]);

    const el = render();
    const all = [...el.querySelectorAll<HTMLDetailsElement>(".row-details")];
    expect(all).toHaveLength(2);
    const ethRow = [...el.querySelectorAll(".alert-item")].find((r) =>
      r.textContent?.includes("ETHUSDT"),
    );
    const ethDetails = ethRow?.querySelector<HTMLDetailsElement>(".row-details");
    (ethDetails?.querySelector("summary") as HTMLElement).click();
    flushSync();

    expect(ethDetails?.open).toBe(true);
    expect(ethDetails?.textContent).toContain("4200");
    expect(all[0].open).toBe(false);
  });

  it("FEAT-0543: names the disclosure with the row's symbol", () => {
    seedRules([rule({ conditions: PRICE_CROSS })]);

    const details = expandFirstRow(render());

    expect(
      details.querySelector("summary")?.getAttribute("aria-label"),
    ).toBe(`BTCUSDT: ${en.dashboard.alerts.configuration}`);
  });

  it("FEAT-0543: keeps a partial condition listable but renders no configuration", () => {
    seedRules([
      {
        id: "partial",
        symbol: "BTCUSDT",
        conditions: { kind: "group" },
        action: { consequence_level: "notify" },
        provenance: { source: "human", created_at_ms: 1 },
        trigger_timeframe: "1m",
      },
    ]);

    const el = render();

    expect(el.querySelectorAll(".alert-item")).toHaveLength(1);
    expect(el.querySelector(".row-details")).toBeNull();
    expect(el.querySelector(".delete-btn")).not.toBeNull();
    expect(el.querySelector(".edit-btn")).not.toBeNull();
  });

  it("FEAT-0543: keeps an unknown condition kind listable without phrasing it", () => {
    seedRules([
      {
        id: "unknown",
        symbol: "BTCUSDT",
        conditions: { kind: "mystery" },
        action: { consequence_level: "notify" },
        provenance: { source: "human", created_at_ms: 1 },
        trigger_timeframe: "1m",
      },
    ]);

    const el = render();

    expect(el.querySelectorAll(".alert-item")).toHaveLength(1);
    expect(el.querySelector(".row-details")).toBeNull();
    expect(el.querySelector(".delete-btn")).not.toBeNull();
  });

  it("FEAT-0543: survives a non-array trigger_methods field", () => {
    seedRules([rule({ conditions: PRICE_CROSS, trigger_methods: "sound" })]);

    const details = expandFirstRow(render());

    expect(details).not.toBeNull();
    expect(details.textContent).not.toContain(en.common.channels);
  });

  it("FEAT-0543: falls back to raw lifecycle values it does not recognise", () => {
    seedRules([
      rule({
        conditions: PRICE_CROSS,
        frequency: "sometimes",
        evaluation_mode: "tickwise",
        trigger_methods: ["carrier_pigeon"],
      }),
    ]);

    const pairs = detailPairs(expandFirstRow(render()));

    expect(pairs[en.dashboard.alerts.panel.lifecycle.frequency]).toBe("sometimes");
    expect(pairs[en.dashboard.alerts.panel.evaluationMode]).toBe("tickwise");
    expect(pairs[en.common.channels]).toBe("carrier_pigeon");
  });

  it("FEAT-0543: still phrases a pre-action legacy rule", () => {
    // `renderRuleSentence` reads `action` for its lead, so `sentenceFor`
    // supplies the same `notify` fill `loadForEdit` does. A rule stored
    // before that field existed must still get its detail.
    const legacy = rule({ conditions: PRICE_CROSS }) as Record<string, unknown>;
    delete legacy.action;
    seedRules([legacy]);

    const text = expandFirstRow(render()).textContent ?? "";

    expect(text).toContain("70000");
    expect(text).toContain("1m");
  });

  it("BUG-0755: marks a rule suspended for a deleted drawing", () => {
    alertState.drawingReport = { rules: [], suspended: ["rule-1"], withheld: [] };
    seedRules([rule({ id: "rule-1", enabled: false })]);

    const el = render();
    const badge = el.querySelector(".suspended-badge");

    expect(badge?.textContent?.trim()).toBe(en.dashboard.alerts.suspended);
    expect(badge?.getAttribute("title")).toBe(
      en.dashboard.alerts.suspendedDrawing,
    );
    expect(el.querySelector(".suspended-reason")?.textContent?.trim()).toBe(
      en.dashboard.alerts.suspendedDrawing,
    );
  });

  it("BUG-0755: marks a rule suspended for an orphaned source alert", () => {
    alertState.orphanReport = { rules: [], suspended: ["rule-1"], withheld: [] };
    seedRules([rule({ id: "rule-1", enabled: false })]);

    const el = render();
    const badge = el.querySelector(".suspended-badge");

    expect(badge?.textContent?.trim()).toBe(en.dashboard.alerts.suspended);
    expect(badge?.getAttribute("title")).toBe(
      en.dashboard.alerts.suspendedOrphan,
    );
    expect(el.querySelector(".suspended-reason")?.textContent?.trim()).toBe(
      en.dashboard.alerts.suspendedOrphan,
    );
  });

  it("BUG-0755: names no reason generically when neither report owns it", () => {
    seedRules([rule({ id: "rule-1", enabled: false })]);

    const el = render();
    const badge = el.querySelector(".suspended-badge");

    expect(badge?.getAttribute("title")).toBe(
      en.dashboard.alerts.suspendedHint,
    );
    expect(el.querySelector(".suspended-reason")).toBeNull();
  });

  it("BUG-0755: keeps the fired badge on a fired rule that is also disabled", () => {
    seedRules([rule({ id: "spent", enabled: false })], { spent: 1 });

    const el = render();

    expect(el.querySelector(".status-fired")).not.toBeNull();
    expect(el.querySelector(".suspended-badge")).toBeNull();
  });

  it("FEAT-0746: pauses and resumes from the row", () => {
    seedRules([rule({ id: "rule-1" })]);

    const el = render();
    const pause = el.querySelector<HTMLButtonElement>(".pause-btn");

    expect(pause?.getAttribute("aria-label")).toBe(
      en.dashboard.alerts.pauseAlert,
    );
    // One state signal: the action name. `aria-pressed` alongside a label that
    // already flips reads as "Resume, pressed" for a running rule.
    expect(pause?.hasAttribute("aria-pressed")).toBe(false);

    pause!.click();
    flushSync();

    const resume = el.querySelector<HTMLButtonElement>(".pause-btn");
    expect(resume?.getAttribute("aria-label")).toBe(
      en.dashboard.alerts.resumeAlert,
    );
    expect(resume?.getAttribute("title")).toBe(
      en.dashboard.alerts.resumeAlert,
    );
    expect(resume?.closest(".alert-item")?.querySelector(".suspended-badge")).not.toBeNull();

    resume!.click();
    flushSync();

    expect(
      el.querySelector<HTMLButtonElement>(".pause-btn")?.getAttribute("aria-label"),
    ).toBe(en.dashboard.alerts.pauseAlert);
  });

  it("FEAT-0746: hides pause on a spent once row but still offers duplicate", () => {
    seedRules([rule({ id: "spent", enabled: false })], { spent: 1 });

    const el = render();

    expect(el.querySelector(".pause-btn")).toBeNull();
    expect(el.querySelector(".duplicate-btn")).not.toBeNull();
  });

  it("BUG-0754: keeps a repeating rule that fired in the list as armed, with its count", () => {
    seedRules(
      [rule({ id: "repeat", frequency: "every_time", enabled: true })],
      { repeat: 3 },
    );

    const el = render();
    const row = el.querySelector(".alert-item");

    expect(row).not.toBeNull();
    expect(row?.querySelector(".status-armed")).not.toBeNull();
    expect(row?.querySelector(".fired-count")?.textContent?.trim()).toBe(
      en.dashboard.alerts.manageList.firedTimes.replace("{count}", "3"),
    );
    expect(row?.querySelector(".pause-btn")).not.toBeNull();
  });

  it("FEAT-0746: duplicates with a localised copy name and says it starts paused", () => {
    seedRules([rule({ id: "rule-1", name: "BTC breakout" })]);
    const duplicate = vi
      .spyOn(ruleActions, "duplicateRule")
      .mockReturnValue({
        ok: true,
        rule: rule({ id: "copy", enabled: false }) as RuleDocument,
      });
    const toast = vi.spyOn(uiState, "showToast");
    const before = alertState.rulesVersion;

    const el = render();
    const button = el.querySelector<HTMLButtonElement>(".duplicate-btn");
    expect(button?.tagName).toBe("BUTTON");
    expect(button?.getAttribute("aria-label")).toBe(
      en.dashboard.alerts.duplicateAlert,
    );
    button!.focus();
    expect(document.activeElement).toBe(button);

    button!.click();
    flushSync();

    expect(duplicate).toHaveBeenCalledWith("rule-1", "BTC breakout (copy)");
    expect(alertState.rulesVersion).toBe(before + 1);
    expect(toast).toHaveBeenCalledWith(
      en.dashboard.alerts.duplicated,
      "success",
    );
  });

  it("FEAT-0746: duplicates the clicked row, not the first one", () => {
    seedRules([
      rule({ id: "keep", name: "Keep", symbol: "BTCUSDT" }),
      rule({ id: "copy-me", name: "Second", symbol: "ETHUSDT" }),
    ]);
    const duplicate = vi
      .spyOn(ruleActions, "duplicateRule")
      .mockReturnValue({
        ok: true,
        rule: rule({ id: "copy", enabled: false }) as RuleDocument,
      });

    const el = render();
    const second = [...el.querySelectorAll(".alert-item")].find((row) =>
      row.textContent?.includes("ETHUSDT"),
    );
    second?.querySelector<HTMLButtonElement>(".duplicate-btn")?.click();
    flushSync();

    expect(duplicate).toHaveBeenCalledWith("copy-me", "Second (copy)");
  });

  it("FEAT-0746: reports a failed pause instead of silently doing nothing", () => {
    seedRules([rule({ id: "rule-1" })]);
    vi.spyOn(ruleActions, "setRuleEnabled").mockReturnValue({
      ok: false,
      reason: "conflict",
    });
    const toast = vi.spyOn(uiState, "showToast");
    const before = alertState.rulesVersion;

    const el = render();
    (el.querySelector(".pause-btn") as HTMLButtonElement).click();
    flushSync();

    expect(toast).toHaveBeenCalledWith(en.dashboard.alerts.ruleChanged, "error");
    expect(alertState.rulesVersion).toBe(before);
  });

  it.each([
    ["anchor-failed", "duplicateAnchorFailed"],
    ["bot", "duplicateBot"],
    ["unknown", "editMissing"],
    ["unreadable", "duplicateUnreadable"],
    ["invalid", "duplicateInvalid"],
    ["core-unavailable", "duplicateUnavailable"],
  ] as const)("FEAT-0746: maps refusal %s", (reason, key) => {
    seedRules([rule({ id: "rule-1" })]);
    vi.spyOn(ruleActions, "duplicateRule").mockReturnValue({
      ok: false,
      reason,
    });
    const toast = vi.spyOn(uiState, "showToast");
    const before = alertState.rulesVersion;

    const el = render();
    (el.querySelector(".duplicate-btn") as HTMLButtonElement).click();
    flushSync();

    expect(toast).toHaveBeenCalledWith(en.dashboard.alerts[key], "error");
    expect(alertState.rulesVersion).toBe(before);
  });

  /*
   * FEAT-0747 — the firing log reads the ledger, not the rule list: an
   * announcement is an event, and deleting the rule it belongs to is not a
   * request to erase the evidence that it fired.
   */
  const LEDGER_KEY = "cachy_shadow_firings_v1";

  function seedLedger(records: unknown[]) {
    localStorage.setItem(
      LEDGER_KEY,
      JSON.stringify({ schema_version: 1, records }),
    );
    alertState.firingsVersion += 1;
  }

  function firingRecord(overrides: Record<string, unknown> = {}) {
    return {
      source: "rule",
      recordedAtMs: Date.parse("2026-10-30T10:00:00Z"),
      symbol: "BTCUSDT",
      id: "rule-1",
      timeframe: "1m",
      anchorMs: Date.parse("2026-10-30T09:59:00Z"),
      verdict: "Triggered",
      ...overrides,
    };
  }

  it("FEAT-0747: lists a rule's announcement in the Log tab with its candle", () => {
    seedRules([rule({ id: "rule-1", name: "Breakout" })]);
    seedLedger([firingRecord()]);

    const el = render();
    const [, logTab] = listTabs(el);

    expect(logTab.textContent?.trim()).toBe(
      en.dashboard.alerts.manageList.tabLog.replace("{count}", "1"),
    );

    logTab.click();
    flushSync();

    const entry = el.querySelector(".log-item");
    expect(entry?.textContent).toContain("BTCUSDT");
    expect(entry?.textContent).toContain("Breakout");
    expect(entry?.textContent).toContain("Triggered");
    expect(el.querySelector(".log-cap")?.textContent).toContain("500");
  });

  it("FEAT-0747: keeps the log entry after the rule is deleted", () => {
    seedRules([rule({ id: "rule-1", name: "Breakout" })]);
    seedLedger([firingRecord()]);

    const el = render();
    (el.querySelector(".delete-btn") as HTMLButtonElement).click();
    flushSync();

    const [, logTab] = listTabs(el);
    logTab.click();
    flushSync();

    const entry = el.querySelector(".log-item");
    expect(entry?.textContent).toContain("BTCUSDT");
    expect(entry?.textContent).toContain(en.dashboard.alerts.manageList.logDeletedRule);
  });

  it("FEAT-0747: adds a state-only entry for a fired rule the ledger never saw", () => {
    seedRules([rule({ id: "rule-1", frequency: "every_time" })], {
      "rule-1": 1,
    });
    // `seedRules` writes only `fired_count`; the anchor is what the fallback
    // needs, so write it the way the state store does.
    localStorage.setItem(
      RULE_STATE_KEY,
      JSON.stringify({
        "rule-1": { fired_count: 1, last_fired_anchor_ms: Date.parse("2026-10-30T09:00:00Z") },
      }),
    );
    alertState.rulesVersion += 1;

    const el = render();
    listTabs(el)[1].click();
    flushSync();

    const entry = el.querySelector(".log-item");
    expect(entry?.textContent).toContain("BTCUSDT");
    expect(entry?.textContent).toContain(en.dashboard.alerts.manageList.logAnchorOnly);
    // No wall clock was invented, so the "candle" meta must be absent.
    expect(entry?.querySelector(".log-times .meta")).toBeNull();
  });

  it("FEAT-0747: says the log is empty rather than rendering nothing", () => {
    seedRules([rule()]);

    const el = render();
    listTabs(el)[1].click();
    flushSync();

    expect(el.querySelector(".empty-state")?.textContent?.trim()).toBe(
      en.dashboard.alerts.manageList.logEmpty,
    );
  });

  it("FEAT-0747: the firing sink is what makes the log re-read", () => {
    seedRules([rule({ id: "rule-1", frequency: "every_time" })]);

    const el = render();
    const [, logTab] = listTabs(el);
    expect(logTab.textContent?.trim()).toBe(
      en.dashboard.alerts.manageList.tabLog.replace("{count}", "0"),
    );

    const before = alertState.firingsVersion;
    notifyingRuleSink({
      rule: rule({ id: "rule-1", frequency: "every_time" }) as never,
      verdict: { verdict: "fires" } as never,
      anchorMs: Date.parse("2026-10-30T09:59:00Z"),
    });
    flushSync();

    expect(alertState.firingsVersion).toBe(before + 1);
    const [, refreshedLogTab] = listTabs(el);
    expect(refreshedLogTab.textContent?.trim()).toBe(
      en.dashboard.alerts.manageList.tabLog.replace("{count}", "1"),
    );
  });

  it("FEAT-0747: opens a rule from its log entry", () => {
    seedRules([rule({ id: "rule-1", name: "Breakout" })]);
    seedLedger([firingRecord()]);

    const el = render();
    listTabs(el)[1].click();
    flushSync();

    const link = el.querySelector<HTMLButtonElement>(".rule-link");
    if (!link) throw new Error("no rule link");
    link.click();
    flushSync();

    expect(alertPanelState.draft.id).toBe("rule-1");
  });

  it("FEAT-0747: keeps an unnamed rule openable in the log", () => {
    seedRules([rule({ id: "rule-1", name: "" })]);
    seedLedger([firingRecord()]);

    const el = render();
    listTabs(el)[1].click();
    flushSync();

    const entry = el.querySelector(".log-item");
    expect(entry?.textContent).not.toContain(en.dashboard.alerts.manageList.logDeletedRule);
    expect(entry?.querySelector(".rule-link")?.textContent?.trim()).toBe("rule-1");
  });

});
