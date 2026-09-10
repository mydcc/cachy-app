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
 * FEAT-0390 — the Price tab, exercised through the DOM.
 *
 * These assert the *document* the form produces rather than the markup, because
 * the document is what the core is handed and what the sentence is rendered
 * from. A form that looks right and writes the wrong condition is precisely the
 * failure this tab exists to remove.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import en from "../../../locales/locales/en.json";
import PriceTab from "./PriceTab.svelte";
import { alertPanelState } from "../../../stores/alertPanel.svelte";
import type { Condition } from "../../../lib/rules/types";

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
  const translate = (key: string) => getNestedTranslation(key);
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

describe("FEAT-0390: PriceTab", () => {
  let target: HTMLElement;
  let component: ReturnType<typeof mount> | null = null;

  beforeEach(() => {
    target = document.createElement("div");
    document.body.appendChild(target);
    alertPanelState.reset("BTCUSDT");
  });

  afterEach(() => {
    if (component) unmount(component);
    component = null;
    target.remove();
  });

  function render() {
    component = mount(PriceTab, { target, props: { symbol: "BTCUSDT" } });
    flushSync();
    return target;
  }

  /** The single condition the tab wrote, or undefined when it wrote none. */
  function writtenCondition(): Condition | undefined {
    const conditions = alertPanelState.draft.conditions;
    return conditions.kind === "group" ? conditions.of[0] : conditions;
  }

  function chooseKind(el: HTMLElement, value: string) {
    const radio = el.querySelector<HTMLInputElement>(
      `input[name="price-condition-kind"][value="${value}"]`,
    );
    if (!radio) throw new Error(`no condition kind "${value}" in the form`);
    radio.checked = true;
    radio.dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();
  }

  function typeThreshold(el: HTMLElement, value: string) {
    const input = el.querySelector<HTMLInputElement>('input[inputmode="decimal"]');
    if (!input) throw new Error("no threshold input in the form");
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
  }

  /*
   * FEAT-0395 — the tab renders the draft it was handed.
   *
   * A chart right-click seeds the document and *then* the panel opens; if the
   * form only ever wrote, the trader would land on an empty form and the price
   * they clicked would live on invisibly inside the rule. Reading the document
   * back also means switching tabs and returning no longer discards a
   * half-built condition.
   */
  describe("FEAT-0395: a pre-filled draft", () => {
    it("shows the level a chart click seeded, not an empty form", () => {
      alertPanelState.seed({
        symbol: "BTCUSDT",
        tab: "price",
        condition: {
          kind: "cross",
          left: { kind: "price", field: "close" },
          direction: "above",
          right: { kind: "constant", value: "61234.57" },
          timeframe: "1h",
        },
      });

      const el = render();

      const checked = el.querySelector<HTMLInputElement>(
        'input[name="price-condition-kind"]:checked',
      );
      expect(checked?.value).toBe("rises_above");
      expect(
        el.querySelector<HTMLInputElement>('input[inputmode="decimal"]')?.value,
      ).toBe("61234.57");
    });

    it("shows a downward level as falls below", () => {
      alertPanelState.seed({
        symbol: "BTCUSDT",
        tab: "price",
        condition: {
          kind: "cross",
          left: { kind: "price", field: "close" },
          direction: "below",
          right: { kind: "constant", value: "58000" },
          timeframe: "1h",
        },
      });

      const el = render();

      expect(
        el.querySelector<HTMLInputElement>('input[name="price-condition-kind"]:checked')?.value,
      ).toBe("falls_below");
    });

    it("keeps the seeded condition in the document after mounting", () => {
      // The write-through effect runs on mount. Rebuilding the same condition
      // is what proves the form and the document agree — an effect that wrote
      // `null` here would silently disarm the alarm the trader just clicked.
      alertPanelState.seed({
        symbol: "BTCUSDT",
        tab: "price",
        condition: {
          kind: "cross",
          left: { kind: "price", field: "close" },
          direction: "above",
          right: { kind: "constant", value: "61234.57" },
          timeframe: "1h",
        },
      });

      render();

      expect(writtenCondition()).toMatchObject({
        kind: "cross",
        direction: "above",
        right: { kind: "constant", value: "61234.57" },
      });
    });

    it("stays editable — typing replaces the seeded level", () => {
      alertPanelState.seed({
        symbol: "BTCUSDT",
        tab: "price",
        condition: {
          kind: "cross",
          left: { kind: "price", field: "close" },
          direction: "above",
          right: { kind: "constant", value: "61234.57" },
          timeframe: "1h",
        },
      });

      const el = render();
      typeThreshold(el, "62000");

      expect(writtenCondition()).toMatchObject({
        right: { kind: "constant", value: "62000" },
      });
    });
  });

  it("offers all four condition types", () => {
    const el = render();
    const values = [...el.querySelectorAll<HTMLInputElement>('input[name="price-condition-kind"]')]
      .map((input) => input.value);
    expect(values).toEqual(["rises_above", "falls_below", "rise_reaches", "fall_reaches"]);
  });

  /**
   * A crossing, not a comparison. This is the difference between an alarm that
   * fires when the price rises through 60000 and one that fires immediately
   * because it was already above it.
   */
  it("writes a crossing for rises above, not a comparison", () => {
    const el = render();
    chooseKind(el, "rises_above");
    typeThreshold(el, "60000");

    expect(writtenCondition()).toEqual({
      kind: "cross",
      left: { kind: "price", field: "close" },
      direction: "above",
      right: { kind: "constant", value: "60000" },
      timeframe: "1h",
    });
  });

  it("writes a downward crossing for falls below", () => {
    const el = render();
    chooseKind(el, "falls_below");
    typeThreshold(el, "60000");

    expect(writtenCondition()).toMatchObject({ kind: "cross", direction: "below" });
  });

  it("writes a percentage comparison for a rise", () => {
    const el = render();
    chooseKind(el, "rise_reaches");
    typeThreshold(el, "5");

    expect(writtenCondition()).toEqual({
      kind: "compare",
      left: { kind: "percent_change", field: "close", lookback: 1 },
      op: "gte",
      right: { kind: "constant", value: "5" },
      timeframe: "1h",
    });
  });

  /**
   * The trader types a positive 5 for a fall; the document has to carry -5,
   * because a fall is the same operand against a negative threshold.
   */
  it("negates the threshold for a fall so the trader never types a minus", () => {
    const el = render();
    chooseKind(el, "fall_reaches");
    typeThreshold(el, "5");

    expect(writtenCondition()).toMatchObject({
      op: "lte",
      right: { kind: "constant", value: "-5" },
    });
  });

  /**
   * `last` is the default and must not be serialised, so a rule reading it
   * keeps the exact canonical form — and therefore the content hash — of a
   * document written before the field existed.
   */
  it("leaves the price series off the operand when it is the last price", () => {
    const el = render();
    typeThreshold(el, "60000");

    expect(writtenCondition()).toMatchObject({ left: { kind: "price" } });
    expect(writtenCondition()?.kind === "cross" && "source" in writtenCondition()!["left" as never])
      .toBe(false);
  });

  it("names the mark series on the operand when the trader picks it", () => {
    const el = render();
    typeThreshold(el, "60000");
    alertPanelState.priceSeries = "mark";
    flushSync();

    expect(writtenCondition()).toMatchObject({
      left: { kind: "price", field: "close", source: "mark" },
    });
  });

  it("carries the OHLC field chosen in the panel header", () => {
    const el = render();
    alertPanelState.priceField = "high";
    typeThreshold(el, "60000");

    expect(writtenCondition()).toMatchObject({ left: { field: "high" } });
  });

  it("uses the draft's trigger timeframe rather than a fixed one", () => {
    alertPanelState.setTimeframe("4h");
    const el = render();
    typeThreshold(el, "60000");

    expect(writtenCondition()).toMatchObject({ timeframe: "4h" });
  });

  /**
   * An empty or half-typed threshold must leave the draft without a condition,
   * which is what keeps the shell's arm button disabled. Arming "rises above
   * nothing" is worse than not arming at all.
   */
  it("writes no condition while the threshold is not a usable number", () => {
    const el = render();
    for (const attempt of ["", "   ", "-", "abc", "0"]) {
      typeThreshold(el, attempt);
      expect(writtenCondition()).toBeUndefined();
    }
  });

  it("refuses a negative price level", () => {
    const el = render();
    typeThreshold(el, "-100");
    expect(writtenCondition()).toBeUndefined();
  });

  /**
   * A move of zero percent is true on every candle — an alarm that never stops
   * rather than one that never fires.
   */
  it("refuses a zero-percent move", () => {
    const el = render();
    chooseKind(el, "rise_reaches");
    typeThreshold(el, "0");
    expect(writtenCondition()).toBeUndefined();
  });

  it("keeps a long decimal threshold exactly as typed", () => {
    const el = render();
    typeThreshold(el, "0.000000123456789");
    expect(writtenCondition()).toMatchObject({
      right: { kind: "constant", value: "0.000000123456789" },
    });
  });

  it("shows the lookback control only for a percentage condition", () => {
    const el = render();
    expect(el.querySelector('input[type="number"]')).toBeNull();

    chooseKind(el, "rise_reaches");
    expect(el.querySelector('input[type="number"]')).not.toBeNull();
  });
});
