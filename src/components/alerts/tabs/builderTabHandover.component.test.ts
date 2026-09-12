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
 * BUG-0443 -- handing the draft from one builder tab to the next.
 *
 * Every other builder test mounts exactly one tab, which is why the wipe this
 * file reproduces has never shown up: it happens on *mount*, not on edit. The
 * shell code-splits the tabs (FEAT-0389), so switching tabs unmounts one
 * builder and mounts another, and each one's write-through effect runs once
 * before the trader has touched anything.
 *
 * The tests below are deliberately about the document, not the DOM: what the
 * trader must not lose is the condition, and the condition lives in
 * `alertPanelState.draft`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";

import en from "../../../locales/locales/en.json";
import IndicatorsTab from "./IndicatorsTab.svelte";
import PriceTab from "./PriceTab.svelte";
import { alertPanelState } from "../../../stores/alertPanel.svelte";
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

describe("BUG-0443: switching builder tabs", () => {
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

  /**
   * Mounts a tab the way the shell does, replacing whatever tab was mounted
   * before. The unmount is the part that matters: the shell's loader sets
   * `TabComponent = null` before the next chunk resolves, so the outgoing
   * builder is really gone before the incoming one initialises.
   */
  function switchTo(tab: typeof PriceTab | typeof IndicatorsTab): HTMLElement {
    if (mounted) unmount(mounted);
    target.replaceChildren();
    mounted = mount(tab, { target, props: { symbol: SYMBOL } });
    flushSync();
    return target;
  }

  /** Every condition in the draft group, in document order. */
  function conditions(): Condition[] {
    const tree = alertPanelState.draft.conditions;
    if (!tree) return [];
    if (tree.kind !== "group") return [tree];
    return [...tree.of];
  }

  function chooseKind(el: HTMLElement, value: string): void {
    const radio = el.querySelector<HTMLInputElement>(
      `input[name="price-condition-kind"][value="${value}"]`,
    );
    if (!radio) throw new Error(`no condition kind "${value}" in the form`);
    radio.checked = true;
    radio.dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();
  }

  function typeThreshold(el: HTMLElement, value: string): void {
    const input = el.querySelector<HTMLInputElement>('input[inputmode="decimal"]');
    if (!input) throw new Error("no threshold input in the form");
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
  }

  function chooseIndicator(el: HTMLElement, id: string): void {
    const name = getNestedTranslation(`dashboard.alerts.indicators.name.${id}`);
    const tile = [...el.querySelectorAll<HTMLButtonElement>("button.tile")].find(
      (button) => button.textContent?.trim() === name,
    );
    if (!tile) throw new Error(`no tile for "${id}"`);
    tile.click();
    flushSync();
  }

  function configurePrice(): Condition {
    const el = switchTo(PriceTab);
    chooseKind(el, "rises_above");
    typeThreshold(el, "60000");
    const [written] = conditions();
    expect(written, "the price tab wrote no condition to start from").toBeDefined();
    return written;
  }

  function configureIndicator(): Condition {
    const el = switchTo(IndicatorsTab);
    chooseIndicator(el, "rsi");
    const [written] = conditions();
    expect(written, "the indicators tab wrote no condition to start from").toBeDefined();
    return written;
  }

  it("keeps the price condition when the trader opens the Indicators tab", () => {
    // The trader typed a threshold, then went looking at indicators. Nothing
    // was edited away, so nothing may be thrown away.
    const priceCondition = configurePrice();

    switchTo(IndicatorsTab);

    expect(conditions()).toContainEqual(priceCondition);
  });

  it("keeps the indicator condition when the trader opens the Price tab", () => {
    // The same collision in the other direction: `readPriceForm` cannot
    // represent an indicator condition, so it starts blank -- and a blank form
    // must not be written over somebody else's work.
    const indicatorCondition = configureIndicator();

    switchTo(PriceTab);

    expect(conditions()).toContainEqual(indicatorCondition);
  });

  it("survives a round trip back to the tab that authored the condition", () => {
    // What the trader actually does: configure, look elsewhere, come back. The
    // form fields are asserted as well as the document, because the form
    // rehydrates from the document -- a condition that survived but no longer
    // reads back into the form would still show the trader an empty panel.
    const priceCondition = configurePrice();

    switchTo(IndicatorsTab);
    const el = switchTo(PriceTab);

    expect(conditions()).toContainEqual(priceCondition);
    expect(el.querySelector<HTMLInputElement>('input[inputmode="decimal"]')?.value).toBe(
      "60000",
    );
    expect(
      el.querySelector<HTMLInputElement>('input[name="price-condition-kind"]:checked')?.value,
    ).toBe("rises_above");
  });

  it("still empties the group when the trader clears the condition themselves", () => {
    // The guard on the fix. `setSingleCondition(null)` emptying the group is
    // load-bearing: it is what disables the arm button, and an armed alert with
    // no trigger is worse than no alert. A deliberate clear is not a wipe.
    const el = switchTo(PriceTab);
    chooseKind(el, "rises_above");
    typeThreshold(el, "60000");
    expect(conditions()).toHaveLength(1);

    typeThreshold(el, "");

    expect(conditions()).toHaveLength(0);
  });
});
