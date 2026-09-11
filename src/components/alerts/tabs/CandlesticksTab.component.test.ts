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

/*
 * FEAT-0394 — the Candlesticks tab, asserted through the document it writes.
 *
 * `patternCatalogue.test.ts` covers the data: names, groups, warmup, the shared
 * Academy ids. None of that says the component wires a click to the draft. The
 * failure this file exists for is a tab that renders fourteen correct tiles and
 * arms nothing, or arms the pattern next to the one that was clicked — both
 * look fine on screen.
 *
 * So these assert `alertPanelState.draft`, not the markup, for the same reason
 * PriceTab's tests do: the document is what the core is handed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import en from "../../../locales/locales/en.json";
import CandlesticksTab from "./CandlesticksTab.svelte";
import { alertPanelState } from "../../../stores/alertPanel.svelte";
import { ALL_PATTERNS } from "../../../lib/alerts/patternCatalogue";
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

describe("FEAT-0394: CandlesticksTab", () => {
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
    component = mount(CandlesticksTab, { target, props: { symbol: "BTCUSDT" } });
    flushSync();
    return target;
  }

  /** The single condition the tab wrote, or undefined when it wrote none. */
  function writtenCondition(): Condition | undefined {
    const conditions = alertPanelState.draft.conditions;
    return conditions?.kind === "group" ? conditions.of[0] : conditions;
  }

  function choosePattern(el: HTMLElement, pattern: string) {
    const radio = el.querySelector<HTMLInputElement>(
      `input[name="candlestick-pattern"][value="${pattern}"]`,
    );
    if (!radio) throw new Error(`no tile for pattern "${pattern}"`);
    radio.checked = true;
    radio.dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();
  }

  describe("the tiles on offer", () => {
    it("offers a tile for every pattern the core can detect, and no more", () => {
      // A tile with no detector behind it is an alarm that never fires; a
      // detector with no tile is a capability nobody can reach.
      const el = render();
      const values = [
        ...el.querySelectorAll<HTMLInputElement>('input[name="candlestick-pattern"]'),
      ].map((input) => input.value);
      expect([...values].sort()).toEqual([...ALL_PATTERNS].sort());
    });

    it("draws each tile with as many candles as the pattern spans", () => {
      // The glyph is the only thing distinguishing a hammer tile from a hanging
      // man tile at a glance, so an empty or wrong-length drawing is not
      // cosmetic here.
      const el = render();
      const singleTile = el
        .querySelector('input[value="hammer"]')
        ?.closest("label");
      const structuralTile = el
        .querySelector('input[value="morning_star"]')
        ?.closest("label");
      expect(singleTile?.querySelectorAll("rect")).toHaveLength(1);
      expect(structuralTile?.querySelectorAll("rect")).toHaveLength(3);
    });
  });

  describe("what a click writes into the draft", () => {
    it("writes the pattern that was clicked", () => {
      const el = render();
      choosePattern(el, "morning_star");
      expect(writtenCondition()).toEqual({
        kind: "pattern",
        pattern: "morning_star",
        timeframe: alertPanelState.draft.trigger_timeframe,
      });
    });

    it("writes each pattern under its own name, never a neighbour's", () => {
      // Guards the pairing that costs money: hammer and hanging man are the
      // same drawing, sit side by side, and mean opposite things.
      const el = render();
      for (const pattern of ALL_PATTERNS) {
        choosePattern(el, pattern);
        expect(writtenCondition(), `clicking '${pattern}'`).toMatchObject({
          kind: "pattern",
          pattern,
        });
      }
    });

    it("anchors the condition to the draft's trigger timeframe", () => {
      alertPanelState.seed({ symbol: "BTCUSDT", tab: "candlesticks", timeframe: "1d" });
      const el = render();
      choosePattern(el, "shooting_star");
      expect(writtenCondition()).toMatchObject({ timeframe: "1d" });
    });

    it("clears the condition rather than arming an empty pattern rule", () => {
      const el = render();
      choosePattern(el, "hammer");
      expect(writtenCondition()).toBeTruthy();

      const clear = [...el.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === getNestedTranslation(
          "dashboard.alerts.candlesticks.clear",
        ),
      );
      if (!clear) throw new Error("no clear button while a pattern is chosen");
      clear.click();
      flushSync();

      // Null, not a pattern-shaped condition with nothing in it: the shell
      // disables its arm button on an absent condition.
      expect(writtenCondition()).toBeFalsy();
    });
  });

  /*
   * FEAT-0395 — the tab renders the draft it was handed.
   *
   * Same contract as the Price tab: switching to another builder and back must
   * not silently discard the pattern already chosen.
   */
  describe("FEAT-0395: a pre-filled draft", () => {
    it("shows the pattern the draft already carries as chosen", () => {
      alertPanelState.seed({
        symbol: "BTCUSDT",
        tab: "candlesticks",
        condition: { kind: "pattern", pattern: "bearish_engulfing", timeframe: "4h" },
      });
      const el = render();
      const chosen = el.querySelector<HTMLInputElement>(
        'input[name="candlestick-pattern"]:checked',
      );
      expect(chosen?.value).toBe("bearish_engulfing");
    });

    it("starts with nothing chosen when the draft came from another builder", () => {
      alertPanelState.seed({
        symbol: "BTCUSDT",
        tab: "price",
        condition: {
          kind: "cross",
          left: { kind: "price", field: "close" },
          direction: "above",
          right: { kind: "constant", value: "60000" },
          timeframe: "4h",
        },
      });
      const el = render();
      expect(
        el.querySelector('input[name="candlestick-pattern"]:checked'),
      ).toBeNull();
    });
  });
});
