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
 * FEAT-0028 -- the builder as a trader meets it.
 *
 * The unit tests cover the conversions; these cover the two things only the
 * mounted component can show: that every choice reaches the rule document, and
 * that a pairing the core would refuse is never offered in the first place.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";

import en from "../../../locales/locales/en.json";
import IndicatorsTab from "./IndicatorsTab.svelte";
import { alertPanelState } from "../../../stores/alertPanel.svelte";
import { INDICATOR_CATALOGUE } from "../../../lib/alerts/indicatorCatalogue";
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

describe("FEAT-0028: IndicatorsTab", () => {
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
    component = mount(IndicatorsTab, { target, props: { symbol: "BTCUSDT" } });
    flushSync();
    return target;
  }

  /** The single condition the tab wrote, or undefined when it wrote none. */
  function writtenCondition(): Condition | undefined {
    const conditions = alertPanelState.draft.conditions;
    return conditions?.kind === "group" ? conditions.of[0] : (conditions ?? undefined);
  }

  function tile(el: HTMLElement, id: string): HTMLButtonElement {
    const name = getNestedTranslation(`dashboard.alerts.indicators.name.${id}`);
    const found = [...el.querySelectorAll<HTMLButtonElement>("button.tile")].find(
      (button) => button.textContent?.trim() === name,
    );
    if (!found) throw new Error(`no tile for "${id}"`);
    return found;
  }

  function choose(el: HTMLElement, id: string): void {
    tile(el, id).click();
    flushSync();
  }

  function selectByLabel(el: HTMLElement, label: string): HTMLSelectElement {
    const text = getNestedTranslation(label);
    const field = [...el.querySelectorAll("label.field")].find(
      (candidate) => candidate.querySelector("span")?.textContent?.trim() === text,
    );
    const select = field?.querySelector("select");
    if (!select) throw new Error(`no select under "${text}"`);
    return select as HTMLSelectElement;
  }

  function setSelect(select: HTMLSelectElement, value: string): void {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();
  }

  describe("the indicators on offer", () => {
    it("offers a tile for every indicator the core accepts, and no more", () => {
      // A tile with no registry entry behind it is an alarm that is refused on
      // arm; a registry entry with no tile is a capability nobody can reach.
      const el = render();
      const shown = [...el.querySelectorAll<HTMLButtonElement>("button.tile")].map((button) =>
        button.textContent?.trim(),
      );
      const expected = INDICATOR_CATALOGUE.map((entry) =>
        getNestedTranslation(`dashboard.alerts.indicators.name.${entry.id}`),
      );
      expect(shown.sort()).toEqual(expected.sort());
    });

    it("writes nothing until an indicator is chosen", () => {
      // An armed rule with no condition would be an alert that never fires,
      // and the arm button reads exactly this.
      render();
      expect(writtenCondition()).toBeUndefined();
    });
  });

  describe("what reaches the document", () => {
    it("writes a compare condition from the defaults when an indicator is chosen", () => {
      const el = render();
      choose(el, "rsi");
      expect(writtenCondition()).toEqual({
        kind: "compare",
        left: { kind: "indicator", indicator: { id: "rsi", params: { period: 14 }, output: "value" } },
        op: "gt",
        right: { kind: "constant", value: "0" },
        timeframe: alertPanelState.draft.trigger_timeframe,
      });
    });

    it("carries an edited parameter, not the default of the id", () => {
      // FEAT-0395's promise, tested where it is kept: a trader looking at RSI
      // 21 must not be armed on RSI 14.
      const el = render();
      choose(el, "rsi");
      const input = el.querySelector<HTMLInputElement>("fieldset.params input");
      if (!input) throw new Error("no parameter input");
      input.value = "21";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      flushSync();

      const condition = writtenCondition();
      expect(condition?.kind === "compare" && condition.left).toEqual({
        kind: "indicator",
        indicator: { id: "rsi", params: { period: 21 }, output: "value" },
      });
    });

    it("writes a cross condition when the relation is switched to a crossing", () => {
      const el = render();
      choose(el, "ema");
      setSelect(selectByLabel(el, "dashboard.alerts.indicators.relationLabel"), "cross");
      const condition = writtenCondition();
      expect(condition?.kind).toBe("cross");
      expect(condition?.kind === "cross" && condition.direction).toBe("above");
    });

    it("keeps a factor parameter as a string all the way into the document", () => {
      // Bollinger's std_dev reaches a comparison against a price. Parsed into
      // an f64 on the way it would be the rounding decimal.js exists to avoid.
      const el = render();
      choose(el, "bollinger");
      const condition = writtenCondition();
      expect(condition?.kind === "compare" && condition.left.kind === "indicator"
        ? condition.left.indicator.params.std_dev
        : null).toBe("2");
    });
  });

  /**
   * FEAT-0446 group 4 / ADR-0016: "RSI at its 20-candle high". The window is
   * over the chosen indicator itself.
   */
  describe("an indicator against its own window", () => {
    function opSelect(el: HTMLElement): HTMLSelectElement {
      const label = getNestedTranslation("dashboard.alerts.indicators.relationLabel");
      const select = el.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
      if (!select) throw new Error("no operator select");
      return select;
    }

    it("writes a window over the chosen indicator, at its high, with a new-high comparison", () => {
      const el = render();
      choose(el, "rsi");
      setSelect(selectByLabel(el, "dashboard.alerts.indicators.referenceLabel"), "window");

      const rsi = { kind: "indicator", indicator: { id: "rsi", params: { period: 14 }, output: "value" } };
      expect(writtenCondition()).toEqual({
        kind: "compare",
        left: rsi,
        // Moved off `>`, which can never be true against its own highest.
        op: "gte",
        right: { kind: "window", of: rsi, agg: "max", lookback: 20 },
        timeframe: alertPanelState.draft.trigger_timeframe,
      });
      expect(target.textContent).toContain(en.dashboard.alerts.indicators.windowHint);
    });

    it("offers only the comparisons that can fire, and follows the extreme", () => {
      const el = render();
      choose(el, "rsi");
      setSelect(selectByLabel(el, "dashboard.alerts.indicators.referenceLabel"), "window");
      expect([...opSelect(el).options].map((option) => option.value)).toEqual(["gte", "lt"]);

      const agg = el.querySelector<HTMLSelectElement>(
        `select[aria-label="${getNestedTranslation("dashboard.alerts.indicators.windowAggLabel")}"]`,
      )!;
      setSelect(agg, "min");
      expect([...opSelect(el).options].map((option) => option.value)).toEqual(["lte", "gt"]);
      const condition = writtenCondition();
      expect(condition?.kind === "compare" && [condition.op, condition.right]).toEqual([
        "lte",
        expect.objectContaining({ kind: "window", agg: "min" }),
      ]);
    });

    it("carries the number of candles into the window", () => {
      const el = render();
      choose(el, "atr");
      setSelect(selectByLabel(el, "dashboard.alerts.indicators.referenceLabel"), "window");
      const lookback = el.querySelector<HTMLInputElement>(
        `input[aria-label="${getNestedTranslation("dashboard.alerts.indicators.lookbackLabel")}"]`,
      )!;
      lookback.value = "50";
      lookback.dispatchEvent(new Event("input", { bubbles: true }));
      flushSync();

      const condition = writtenCondition();
      expect(condition?.kind === "compare" && condition.right).toEqual(
        expect.objectContaining({ kind: "window", lookback: 50 }),
      );
    });

    it("keeps the draft on a span the core accepts while typing, and clamps on commit", () => {
      const el = render();
      choose(el, "atr");
      setSelect(selectByLabel(el, "dashboard.alerts.indicators.referenceLabel"), "window");
      const lookback = el.querySelector<HTMLInputElement>(
        `input[aria-label="${getNestedTranslation("dashboard.alerts.indicators.lookbackLabel")}"]`,
      )!;
      const writtenLookback = (): unknown => {
        const condition = writtenCondition();
        return condition?.kind === "compare" && condition.right.kind === "window" && condition.right.lookback;
      };

      // Emptied, a fraction, one past the bound: states on the way, never written.
      for (const typed of ["", "20.5", "501"]) {
        lookback.value = typed;
        lookback.dispatchEvent(new Event("input", { bubbles: true }));
        flushSync();
        expect(writtenLookback(), typed).toBe(20);
      }

      lookback.dispatchEvent(new Event("change", { bubbles: true }));
      flushSync();
      expect(writtenLookback()).toBe(500);
      expect(lookback.value).toBe("500");
    });

    it("renders a saved window condition back into the form", () => {
      const rsi = { kind: "indicator", indicator: { id: "rsi", params: { period: 14 }, output: "value" } } as const;
      alertPanelState.setSlotCondition("indicators", {
        kind: "compare",
        left: rsi,
        op: "lte",
        right: { kind: "window", of: rsi, agg: "min", lookback: 30 },
        timeframe: alertPanelState.draft.trigger_timeframe,
      } as Condition);
      const el = render();

      expect(selectByLabel(el, "dashboard.alerts.indicators.referenceLabel").value).toBe("window");
      expect(
        el.querySelector<HTMLInputElement>(
          `input[aria-label="${getNestedTranslation("dashboard.alerts.indicators.lookbackLabel")}"]`,
        )?.value,
      ).toBe("30");
    });
  });

  describe("the dimension gate", () => {
    it("does not offer the price as a reference for a percentage indicator", () => {
      // `rsi > close` is refused by the core with operand_dimension_mismatch.
      // Here it is not a choice, so nobody meets the refusal.
      const el = render();
      choose(el, "rsi");
      const reference = selectByLabel(el, "dashboard.alerts.indicators.referenceLabel");
      expect([...reference.options].map((option) => option.value)).not.toContain("price");
    });

    it("offers the price as a reference for a price indicator", () => {
      const el = render();
      choose(el, "ema");
      const reference = selectByLabel(el, "dashboard.alerts.indicators.referenceLabel");
      expect([...reference.options].map((option) => option.value)).toContain("price");
    });

    it("offers only same-unit indicators as the second side", () => {
      const el = render();
      choose(el, "volume_ma");
      const reference = selectByLabel(el, "dashboard.alerts.indicators.referenceLabel");
      setSelect(reference, "indicator");
      const which = el.querySelector<HTMLSelectElement>(
        `select[aria-label="${getNestedTranslation("dashboard.alerts.indicators.reference.indicator")}"]`,
      );
      expect([...(which?.options ?? [])].map((option) => option.value)).toEqual(["volume_ma"]);
    });

    it("drops a now-incompatible reference when the output line changes", () => {
      // bollinger.upper is a price and percent_b is not, so a price reference
      // chosen for the band must not survive the switch as an invalid document.
      const el = render();
      choose(el, "bollinger");
      setSelect(selectByLabel(el, "dashboard.alerts.indicators.referenceLabel"), "price");
      expect(writtenCondition()?.kind === "compare").toBe(true);

      setSelect(selectByLabel(el, "dashboard.alerts.indicators.outputLabel"), "percent_b");
      const condition = writtenCondition();
      expect(condition?.kind === "compare" && condition.right).toEqual({
        kind: "constant",
        value: "0",
      });
    });
  });

  // FEAT-0454. The core computes RSI, MACD, CCI, momentum, EMA and Bollinger
  // over the price a reference names. The tab offers that price, reads it back,
  // and writes it into every place the subject appears.
  describe("the price an indicator is computed over", () => {
    const PRICE_LABEL = "dashboard.alerts.indicators.priceSourceLabel";

    function hasPriceSelect(el: HTMLElement): boolean {
      const text = getNestedTranslation(PRICE_LABEL);
      return [...el.querySelectorAll("label.field span")].some((span) => span.textContent?.trim() === text);
    }

    function subjectOf(condition: Condition | undefined): Record<string, unknown> {
      if (condition?.kind !== "compare" && condition?.kind !== "cross") throw new Error("no leaf written");
      if (condition.left.kind !== "indicator") throw new Error("subject is not an indicator");
      return condition.left.indicator as unknown as Record<string, unknown>;
    }

    it("offers every price on an indicator that takes one, starting on its default", () => {
      const el = render();
      choose(el, "rsi");
      const select = selectByLabel(el, PRICE_LABEL);
      expect([...select.options].map((option) => option.value)).toEqual(["close", "open", "high", "low", "hl2", "hlc3"]);
      expect(select.value).toBe("close");

      choose(el, "cci");
      expect(selectByLabel(el, PRICE_LABEL).value).toBe("hlc3");
    });

    it("offers no price on an indicator that is not computed over one", () => {
      const el = render();
      choose(el, "williams_r");
      expect(hasPriceSelect(el)).toBe(false);
    });

    it("writes the chosen price into the subject and into a window over it", () => {
      const el = render();
      choose(el, "rsi");
      setSelect(selectByLabel(el, PRICE_LABEL), "hl2");
      expect(subjectOf(writtenCondition()).field).toBe("hl2");

      setSelect(selectByLabel(el, "dashboard.alerts.indicators.referenceLabel"), "window");
      const written = writtenCondition();
      expect(written).toMatchObject({
        left: { indicator: { id: "rsi", field: "hl2" } },
        right: { kind: "window", of: { kind: "indicator", indicator: { id: "rsi", field: "hl2" } } },
      });
    });

    it("writes no price once the default is chosen back, as the core stores it", () => {
      const el = render();
      choose(el, "rsi");
      setSelect(selectByLabel(el, PRICE_LABEL), "hl2");
      setSelect(selectByLabel(el, PRICE_LABEL), "close");
      expect("field" in subjectOf(writtenCondition())).toBe(false);
    });

    it("starts another indicator on its own default price", () => {
      const el = render();
      choose(el, "rsi");
      setSelect(selectByLabel(el, PRICE_LABEL), "hl2");
      choose(el, "macd");
      expect("field" in subjectOf(writtenCondition())).toBe(false);
      expect(selectByLabel(el, PRICE_LABEL).value).toBe("close");
    });

    it("keeps a saved condition over hl2 exactly as armed, and shows its price", () => {
      // The condition a card drawn over hl2 seeds. Mounting writes through
      // once; before FEAT-0454 slice 2 that write would have dropped the price.
      const saved: Condition = {
        kind: "compare",
        left: { kind: "indicator", indicator: { id: "rsi", params: { period: 14 }, output: "value", field: "hl2" } },
        op: "lt",
        right: { kind: "constant", value: "30" },
        timeframe: alertPanelState.draft.trigger_timeframe,
      };
      alertPanelState.setSingleCondition(saved);

      const el = render();

      expect(tile(el, "rsi").getAttribute("aria-pressed")).toBe("true");
      expect(selectByLabel(el, PRICE_LABEL).value).toBe("hl2");
      expect(alertPanelState.draft.conditions).toEqual({ kind: "group", op: "all", of: [saved] });
    });
  });

  describe("a draft that already holds a condition", () => {
    it("renders the form back out of the document rather than starting blank", () => {
      // The same document whether it was seeded from the chart, typed in
      // another tab, or built here (FEAT-0395).
      alertPanelState.setSingleCondition({
        kind: "cross",
        left: { kind: "indicator", indicator: { id: "macd", params: { fast_period: 12, slow_period: 26, signal_period: 9 }, output: "macd" } },
        direction: "below",
        right: { kind: "indicator", indicator: { id: "macd", params: { fast_period: 12, slow_period: 26, signal_period: 9 }, output: "signal" } },
        timeframe: alertPanelState.draft.trigger_timeframe,
      });
      const el = render();
      expect(tile(el, "macd").getAttribute("aria-pressed")).toBe("true");
      expect(selectByLabel(el, "dashboard.alerts.indicators.relationLabel").value).toBe("cross");
      expect(selectByLabel(el, "dashboard.alerts.indicators.outputLabel").value).toBe("macd");
    });

    // BUG-0451 — the draft can hold an indicator the panel no longer offers,
    // saved while it still was. The tab cannot hydrate it, and "cannot hydrate"
    // must not be written back as "nothing here": mounting would delete an
    // alert the trader still has.
    it.each([
      // Outside the registry: every registry indicator is offered since
      // FEAT-0446 group 4.
      ["an indicator the panel does not offer", { id: "vwap", params: {} }],
      // Offered, but not against a number: the core refuses it, the builder
      // cannot offer it, and mounting must not rewrite it.
      ["OBV against a number, which the builder cannot offer", { id: "obv", params: {} }],
    ])("keeps a saved condition on %s", (_what, indicator) => {
      const saved: Condition = {
        kind: "compare",
        left: { kind: "indicator", indicator },
        op: "gt",
        right: { kind: "constant", value: "1000" },
        timeframe: alertPanelState.draft.trigger_timeframe,
      };
      alertPanelState.setSingleCondition(saved);

      render();

      expect(alertPanelState.draft.conditions).toEqual({
        kind: "group",
        op: "all",
        of: [saved],
      });
    });
  });
});
