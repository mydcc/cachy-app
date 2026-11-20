// @vitest-environment happy-dom
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
 * FEAT-0813 -- the Combo tab as a tree editor: the lock it shows on a rule it
 * cannot represent, groups as cards, leaf kinds, refusals on a nested leaf,
 * and the warmup line the core states.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";

import en from "../../../locales/locales/en.json";
import ComboTab from "./ComboTab.svelte";
import { alertPanelState } from "../../../stores/alertPanel.svelte";
import { ruleSchema } from "../../../lib/rules/ruleSchema";
import { MAX_COMBO_CONDITIONS } from "../../../lib/alerts/comboConditionForm";
import type { Condition } from "../../../lib/rules/types";

const SYMBOL = "BTCUSDT";
const dictionary = en as Record<string, unknown>;

function getNestedTranslation(path: string): string {
  let current: unknown = dictionary;
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object") return path;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : path;
}

vi.mock("../../../locales/i18n", () => {
  const translate = (key: string, opts?: { values?: Record<string, unknown> }) =>
    getNestedTranslation(key).replace(/\{(\w+)\}/g, (_m, name: string) =>
      String(opts?.values?.[name] ?? `{${name}}`),
    );
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

const WASM_JS = pathToFileURL(resolve(process.cwd(), "static/wasm/technicals_wasm.js")).href;
const WASM_BINARY = resolve(process.cwd(), "static/wasm/technicals_wasm_bg.wasm");

beforeAll(async () => {
  const mod = (await import(/* @vite-ignore */ WASM_JS)) as {
    default: (binary: BufferSource) => Promise<unknown>;
  };
  await mod.default(readFileSync(WASM_BINARY));
  ruleSchema.setLoader(async () => mod as never);
  await ruleSchema.load();
});

const rsi = (value: string): Condition => ({
  kind: "compare",
  left: { kind: "indicator", indicator: { id: "rsi", params: { period: 14 } } },
  op: "gt",
  right: { kind: "constant", value },
  timeframe: "1h",
});

describe("FEAT-0813: Combo tab", () => {
  let target: HTMLElement;
  let mounted: ReturnType<typeof mount> | null = null;

  beforeEach(() => {
    target = document.createElement("div");
    document.body.appendChild(target);
    alertPanelState.reset(SYMBOL);
  });

  afterEach(() => {
    if (mounted) unmount(mounted);
    mounted = null;
    target.remove();
  });

  function open(): HTMLElement {
    mounted = mount(ComboTab, { target, props: { symbol: SYMBOL } });
    flushSync();
    return target;
  }

  function click(el: Element | null): void {
    if (!el) throw new Error("nothing to click");
    (el as HTMLElement).click();
    flushSync();
  }

  function buttonByText(el: HTMLElement, text: string): HTMLButtonElement {
    const button = [...el.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent?.trim() === text,
    );
    if (!button) throw new Error(`no button "${text}"`);
    return button;
  }

  it("locks a rule with more conditions than the cap, names the cap, and leaves the rule alone", () => {
    const oversized: Condition = {
      kind: "group",
      op: "all",
      of: Array.from({ length: MAX_COMBO_CONDITIONS + 1 }, (_, i) => rsi(String(50 + i))),
    };
    alertPanelState.draft.conditions = oversized;

    const el = open();

    const lock = el.querySelector('[data-testid="combo-locked"]');
    expect(lock?.getAttribute("data-lock-reason")).toBe("too_many");
    expect(lock?.textContent).toContain(String(MAX_COMBO_CONDITIONS));
    expect(el.querySelector('[data-testid="combo-leaf"]')).toBeNull();
    expect(plain(alertPanelState.draft.conditions)).toEqual(oversized);
  });

  it("locks a NOR group as unsupported instead of rewriting it", () => {
    const nor: Condition = { kind: "group", op: "none", of: [rsi("70")] };
    alertPanelState.draft.conditions = nor;

    const el = open();

    expect(
      el.querySelector('[data-testid="combo-locked"]')?.getAttribute("data-lock-reason"),
    ).toBe("unsupported");
    expect(plain(alertPanelState.draft.conditions)).toEqual(nor);
  });

  it("adds a group as a card and writes it into the draft as a nested group", () => {
    const el = open();
    click(buttonByText(el, getNestedTranslation("dashboard.alerts.combo.addRow")));
    click(buttonByText(el, getNestedTranslation("dashboard.alerts.combo.addGroup")));

    const group = el.querySelector('[data-testid="combo-group"]');
    expect(group).not.toBeNull();
    expect(group?.querySelectorAll('[data-testid="combo-leaf"]')).toHaveLength(1);

    const tree = alertPanelState.draft.conditions;
    if (tree?.kind !== "group") throw new Error("expected a group in the draft");
    expect(tree.of).toHaveLength(2);
    expect(tree.of[1].kind).toBe("group");
  });

  it("switches a leaf to a pattern in place", () => {
    const el = open();
    click(buttonByText(el, getNestedTranslation("dashboard.alerts.combo.addRow")));

    const kind = el.querySelector<HTMLSelectElement>('[data-testid="combo-leaf"] select');
    if (!kind) throw new Error("no kind select");
    kind.value = "pattern";
    kind.dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();

    expect(el.querySelector('[data-testid="combo-leaf"]')?.getAttribute("data-leaf-kind")).toBe(
      "pattern",
    );
    const tree = alertPanelState.draft.conditions;
    if (tree?.kind !== "group") throw new Error("expected a group in the draft");
    expect(tree.of[0].kind).toBe("pattern");
  });

  it("says a leaf is unfinished and keeps arming off while it is", () => {
    const el = open();
    click(buttonByText(el, getNestedTranslation("dashboard.alerts.combo.addRow")));
    click(buttonByText(el, getNestedTranslation("dashboard.alerts.combo.addRow")));
    const kind = el.querySelectorAll('[data-testid="combo-leaf"]')[1].querySelector<HTMLSelectElement>("select");
    if (!kind) throw new Error("no kind select on the second row");
    kind.value = "price";
    kind.dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();

    expect(el.querySelector('[data-testid="combo-incomplete"]')).not.toBeNull();
    expect(alertPanelState.incompleteConditions).toBe(true);
    const tree = alertPanelState.draft.conditions;
    if (tree?.kind !== "group") throw new Error("expected a group in the draft");
    expect(tree.of).toHaveLength(1);

    const input = el
      .querySelectorAll('[data-testid="combo-leaf"]')[1]
      .querySelector<HTMLInputElement>('input[inputmode="decimal"]');
    if (!input) throw new Error("no threshold input on the price row");
    input.value = "60000";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();

    expect(el.querySelector('[data-testid="combo-incomplete"]')).toBeNull();
    expect(alertPanelState.incompleteConditions).toBe(false);
  });

  it("numbers groups by group, not by their position among the rows", () => {
    const el = open();
    click(buttonByText(el, getNestedTranslation("dashboard.alerts.combo.addRow")));
    click(buttonByText(el, getNestedTranslation("dashboard.alerts.combo.addRow")));
    click(buttonByText(el, getNestedTranslation("dashboard.alerts.combo.addGroup")));

    expect(el.querySelector('[data-testid="combo-group"] h5')?.textContent).toBe(
      getNestedTranslation("dashboard.alerts.combo.groupLabel").replace("{index}", "1"),
    );
  });

  it("shows a refusal on the nested leaf the core named, not under the tree", () => {
    alertPanelState.draft.conditions = {
      kind: "group",
      op: "all",
      of: [rsi("70"), { kind: "group", op: "any", of: [rsi("30"), rsi("20")] }],
    };
    const el = open();

    alertPanelState.refusals = [
      {
        code: "test_refusal",
        field: "conditions.of[1].of[1]",
        i18n_key: "rules.refusal.test_refusal",
        detail: "test",
      },
    ];
    flushSync();

    const nestedLeaves = el.querySelectorAll('[data-testid="combo-group"] [data-testid="combo-leaf"]');
    expect(nestedLeaves).toHaveLength(2);
    expect(nestedLeaves[0].querySelector(".refusal")).toBeNull();
    expect(nestedLeaves[1].querySelector(".refusal")?.textContent).toBe(
      "rules.refusal.test_refusal",
    );
    expect(el.querySelectorAll(".refusal")).toHaveLength(1);
  });

  it("states the warmup the core computes for the draft", () => {
    alertPanelState.draft.conditions = { kind: "group", op: "all", of: [rsi("70")] };

    const el = open();

    const line = el.querySelector('[data-testid="combo-warmup"]');
    expect(line).not.toBeNull();
    const expected = ruleSchema.warmupCandles(plain(alertPanelState.draft));
    expect(line?.textContent).toContain(String(expected));
  });
});

/** The draft is a rune proxy; compare plain values. */
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
