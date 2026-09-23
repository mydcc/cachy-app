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
import { alertState } from "../../../stores/alerts.svelte";

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
  });

  afterEach(() => {
    if (component) unmount(component);
    component = null;
    target.remove();
    localStorage.clear();
  });

  function render() {
    component = mount(ManageTab, { target, props: { symbol: "BTCUSDT" } });
    flushSync();
    return target;
  }

  /** The tab's own Active/History switch, addressed the way a trader sees it. */
  function listTabs(el: HTMLElement) {
    return Array.from(el.querySelectorAll("[role='tab'], .list-tab, button")).filter(
      (b) =>
        b.textContent?.trim() === getNestedTranslation("dashboard.alerts.active") ||
        b.textContent?.trim() === getNestedTranslation("dashboard.alerts.history"),
    ) as HTMLButtonElement[];
  }

  it("lists an armed alert under Active with its symbol and condition", () => {
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
  });

  it("keeps a fired alert out of Active and shows it under History with its badge", async () => {
    seedRules(
      [rule({ id: "armed", symbol: "BTCUSDT" }), rule({ id: "fired", symbol: "SOLUSDT" })],
      { fired: 1 },
    );

    const el = render();
    expect(el.textContent).toContain("BTCUSDT");
    expect(el.querySelectorAll(".alert-item")).toHaveLength(1);

    const history = listTabs(el).find(
      (b) => b.textContent?.trim() === getNestedTranslation("dashboard.alerts.history"),
    );
    history?.click();
    flushSync();

    const rows = el.querySelectorAll(".alert-item");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("SOLUSDT");
    expect(rows[0].querySelector(".fired-badge")).not.toBeNull();
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

  it("says the list is empty rather than rendering an empty box", () => {
    const el = render();

    expect(el.querySelector(".empty-state")?.textContent?.trim()).toBe(
      getNestedTranslation("dashboard.alerts.noActive"),
    );
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
});
