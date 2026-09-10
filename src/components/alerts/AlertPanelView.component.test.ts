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
 * FEAT-0389 -- the shell's own acceptance criteria, exercised through the DOM.
 *
 * Three of them are here because nothing else can check them: a banner that
 * survives a tab switch, a sentence that tracks the document, and a refusal
 * that lands against its field instead of in one generic message. The builder
 * tabs are stubs today, so this suite deliberately drives the document
 * directly rather than through a form that does not exist yet.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import en from "../../locales/locales/en.json";
import AlertPanelView from "./AlertPanelView.svelte";
import { alertPanelState } from "../../stores/alertPanel.svelte";
import { alertState } from "../../stores/alerts.svelte";

vi.mock("../../services/logger", () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Stubbed so "Escape closes without arming" can assert against the one call
// that would write a rule, rather than against a side effect of it. Nothing
// else in this suite reaches armRule -- the arm button is disabled until a
// builder produces a condition.
const armRuleSpy = vi.fn();
vi.mock("../../services/alertEngine/armRule", () => ({
  armRule: (...args: unknown[]) => armRuleSpy(...args),
  RuleStoreUnreadableError: class RuleStoreUnreadableError extends Error {
    translationKey = "dashboard.alerts.panel.storeUnreadable";
  },
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

vi.mock("../../locales/i18n", () => {
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

describe("FEAT-0389: AlertPanelView shell", () => {
  let target: HTMLElement;
  let component: ReturnType<typeof mount> | null = null;

  beforeEach(() => {
    target = document.createElement("div");
    document.body.appendChild(target);
    alertPanelState.reset("BTCUSDT");
    alertState.engineStatus = "idle";
  });

  afterEach(() => {
    if (component) unmount(component);
    component = null;
    target.remove();
    alertState.engineStatus = "idle";
  });

  function render() {
    component = mount(AlertPanelView, { target, props: {} });
    flushSync();
    return target;
  }

  /** Waits for the active tab's dynamic import to resolve and paint. */
  async function settleTab() {
    await Promise.resolve();
    await Promise.resolve();
    flushSync();
  }

  it("renders every tab in the strip as a tab", () => {
    const el = render();
    const tabs = [...el.querySelectorAll('[role="tab"]')].map((t) => t.textContent?.trim());
    expect(tabs).toEqual([
      "Templates",
      "Combo",
      "Price",
      "Indicators",
      "Candlesticks",
      "Manage",
    ]);
  });

  it("keeps the engine-failed banner visible across a tab switch", async () => {
    alertState.engineStatus = "failed";
    const el = render();
    const warning = en.dashboard.alerts.engineUnavailableHint;
    expect(el.textContent).toContain(warning);

    (el.querySelector("#alert-tab-price") as HTMLButtonElement).click();
    await settleTab();

    // BUG-0382: a banner that only lived on the Manage tab would let a trader
    // build an alarm in the Price tab with no sign that nothing evaluates it.
    expect(el.textContent).toContain(warning);
  });

  it("writes the draft rule out as a sentence and updates it when the rule changes", async () => {
    const el = render();
    const sentenceOf = () => el.querySelector(".sentence-text")?.textContent ?? "";

    expect(sentenceOf()).toContain("(no condition yet)");

    alertPanelState.draft.conditions = {
      kind: "compare",
      left: { kind: "indicator", indicator: { id: "rsi", params: { length: 14 } } },
      op: "lt",
      right: { kind: "constant", value: "30" },
      timeframe: "1h",
    };
    flushSync();

    expect(sentenceOf()).toContain("RSI(14) is below 30");
    expect(sentenceOf()).not.toContain("(no condition yet)");
  });

  it("anchors a refusal against the field it names instead of one generic message", () => {
    const el = render();
    alertPanelState.refusals = [
      {
        code: "symbol_empty",
        field: "symbol",
        i18n_key: "rules.refusal.unknownField",
        detail: "symbol must not be empty",
      },
    ];
    flushSync();

    const anchored = el.querySelector("#alert-refusal-symbol");
    expect(anchored?.textContent?.trim()).not.toBe("");

    const symbolInput = el.querySelector('input[type="text"]') as HTMLInputElement;
    expect(symbolInput.getAttribute("aria-invalid")).toBe("true");
    expect(symbolInput.getAttribute("aria-describedby")).toBe("alert-refusal-symbol");

    // Claimed by a rendered control, so it must not *also* appear in the
    // catch-all block -- a refusal shown twice reads as two problems.
    expect(el.textContent).not.toContain(en.dashboard.alerts.panel.otherRefusals);
  });

  it("still shows a refusal against a field no control claims", () => {
    const el = render();
    alertPanelState.refusals = [
      {
        code: "conditions_empty",
        field: "conditions.of.0.left",
        i18n_key: "rules.refusal.unknownField",
        detail: "condition has no left operand",
      },
    ];
    flushSync();

    expect(el.textContent).toContain(en.dashboard.alerts.panel.otherRefusals);
    expect(el.textContent).toContain("conditions.of.0.left");
  });

  it("refuses to arm a rule that has no condition yet", () => {
    const el = render();
    const arm = el.querySelector(".arm-btn") as HTMLButtonElement;
    expect(arm.disabled).toBe(true);
  });

  it("moves the selection with the arrow keys, as its tablist role promises", async () => {
    const el = render();
    const first = el.querySelector("#alert-tab-templates") as HTMLButtonElement;
    first.click();
    await settleTab();
    expect(first.getAttribute("aria-selected")).toBe("true");

    first.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await settleTab();

    expect(el.querySelector("#alert-tab-combo")?.getAttribute("aria-selected")).toBe("true");
    expect(first.getAttribute("aria-selected")).toBe("false");
  });
});

/**
 * FEAT-0389 -- the two acceptance criteria the shell can only prove through
 * the keyboard: focus stays inside the panel while Tab cycles it, and Escape
 * is a way out that arms nothing.
 *
 * Escape itself is WindowManager's (see WindowManager.test.ts); what belongs
 * here is the other half of that sentence -- that the panel does not treat a
 * dismissal as a confirmation. The trap is the panel's own, because
 * WindowFrame has no shared one yet.
 */
describe("FEAT-0389: AlertPanelView keyboard containment", () => {
  let target: HTMLElement;
  let component: ReturnType<typeof mount> | null = null;

  beforeEach(() => {
    target = document.createElement("div");
    document.body.appendChild(target);
    alertPanelState.reset("BTCUSDT");
    alertState.engineStatus = "idle";
    armRuleSpy.mockClear();
  });

  afterEach(() => {
    if (component) unmount(component);
    component = null;
    target.remove();
  });

  async function render() {
    component = mount(AlertPanelView, { target, props: {} });
    flushSync();
    // Let the active tab's dynamic import resolve, so the trap sees the
    // controls inside the tab body and not just the shell's own.
    await Promise.resolve();
    await Promise.resolve();
    flushSync();
    return target;
  }

  /**
   * The same set the panel's own handler walks. Duplicated deliberately: a
   * test that asked the component which elements it considers focusable
   * would agree with it by construction.
   */
  function focusables(el: HTMLElement): HTMLElement[] {
    return Array.from(
      el.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ),
    );
  }

  function pressTab(on: HTMLElement, shiftKey = false) {
    on.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true }));
    flushSync();
  }

  it("has more than one stop to cycle between", async () => {
    const el = await render();
    expect(focusables(el).length).toBeGreaterThan(1);
  });

  it("wraps from the last control back to the first instead of leaving the panel", async () => {
    const el = await render();
    const stops = focusables(el);
    const last = stops[stops.length - 1];

    last.focus();
    pressTab(last);

    expect(document.activeElement).toBe(stops[0]);
  });

  it("wraps backwards from the first control to the last", async () => {
    const el = await render();
    const stops = focusables(el);

    stops[0].focus();
    pressTab(stops[0], true);

    expect(document.activeElement).toBe(stops[stops.length - 1]);
  });

  it("leaves focus alone in the middle of the cycle, so Tab still moves", async () => {
    const el = await render();
    const stops = focusables(el);
    const middle = stops[1];

    middle.focus();
    pressTab(middle);

    // The handler must not preventDefault here -- the browser's own Tab has
    // to do the moving, or the panel becomes a one-element trap.
    expect(document.activeElement).toBe(middle);
  });

  it("announces itself as a labelled region, so the trap has something to trap in", async () => {
    const el = await render();
    const panel = el.querySelector(".alert-panel");

    // The keydown handler below hangs off this element. A container that
    // handles keys without a role is unreachable for assistive tech and the
    // Svelte compiler says so; `region` rather than `dialog` because
    // WindowFrame owns the window role and this panel is not modal.
    expect(panel?.getAttribute("role")).toBe("region");
    expect(panel?.getAttribute("aria-label")).toBe(en.dashboard.alerts.panel.title);
  });

  it("arms nothing when Escape is pressed", async () => {
    const el = await render();

    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    flushSync();

    expect(armRuleSpy).not.toHaveBeenCalled();
  });
});
