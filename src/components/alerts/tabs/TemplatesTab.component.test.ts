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
 * FEAT-0391 — the Templates tab, asserted through the draft it writes.
 *
 * `templateLibrary.test.ts` covers the data against the rule core. What it
 * cannot see is the wiring: a category chip that filters nothing, a load
 * button that writes the wrong template, or a click that silently throws away
 * the rule a trader was building.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import en from "../../../locales/locales/en.json";
import TemplatesTab from "./TemplatesTab.svelte";
import { alertPanelState } from "../../../stores/alertPanel.svelte";
import { ALERT_TEMPLATES, templatesIn } from "../../../lib/alerts/templateLibrary";
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

const buildingRule: Condition = {
  kind: "cross",
  left: { kind: "price", field: "close" },
  direction: "above",
  right: { kind: "constant", value: "60000" },
  timeframe: "1h",
};

describe("FEAT-0391: TemplatesTab", () => {
  let target: HTMLElement;
  let component: ReturnType<typeof mount> | null = null;

  beforeEach(() => {
    target = document.createElement("div");
    document.body.appendChild(target);
    alertPanelState.reset("ETHUSDT");
    alertPanelState.activeTab = "templates";
  });

  afterEach(() => {
    if (component) unmount(component);
    component = null;
    target.remove();
  });

  function render() {
    component = mount(TemplatesTab, { target, props: { symbol: "ETHUSDT" } });
    flushSync();
    return target;
  }

  function shownIds(el: HTMLElement): string[] {
    return [...el.querySelectorAll<HTMLElement>("[data-template]")].map((card) => card.dataset.template!);
  }

  function click(el: Element | null | undefined) {
    if (!(el instanceof HTMLElement)) throw new Error("nothing to click");
    el.click();
    flushSync();
  }

  function action(el: HTMLElement, templateId: string, name: "load" | "replace" | "cancel") {
    return el.querySelector(`[data-template="${templateId}"] [data-action="${name}"]`);
  }

  describe("category filter", () => {
    it("shows every template until a category is chosen", () => {
      expect(shownIds(render())).toEqual(ALERT_TEMPLATES.map((entry) => entry.id));
    });

    it("narrows the list to the chosen category, and back", () => {
      const el = render();
      click(el.querySelector('[data-category="reversal"]'));
      expect(shownIds(el)).toEqual(templatesIn("reversal").map((entry) => entry.id));
      expect(shownIds(el).length).toBeLessThan(ALERT_TEMPLATES.length);

      click(el.querySelector(".filter button:not([data-category])"));
      expect(shownIds(el)).toHaveLength(ALERT_TEMPLATES.length);
    });
  });

  describe("loading a template", () => {
    it("writes the clicked template into the draft and opens it in the Combo tab", () => {
      const entry = ALERT_TEMPLATES.find((candidate) => candidate.id === "adx_trend_breakout")!;
      const el = render();
      click(action(el, entry.id, "load"));

      expect(alertPanelState.activeTab).toBe("combo");
      expect(alertPanelState.draft.conditions).toEqual(entry.conditions);
      expect(alertPanelState.draft.trigger_timeframe).toBe(entry.timeframe);
      expect(alertPanelState.draft.name).toBe(
        getNestedTranslation("dashboard.alerts.templates.name.adx_trend_breakout"),
      );
      // The trader's symbol, not one the template brought along.
      expect(alertPanelState.draft.symbol).toBe("ETHUSDT");
      expect(alertPanelState.draft.action).toEqual({ consequence_level: "notify" });
    });

    it("asks before replacing a rule in progress, and keeps it on cancel", () => {
      alertPanelState.setSingleCondition(buildingRule);
      const entry = ALERT_TEMPLATES[0];
      const el = render();

      click(action(el, entry.id, "load"));
      expect(alertPanelState.draft.conditions).toEqual({ kind: "group", op: "all", of: [buildingRule] });
      expect(alertPanelState.activeTab).toBe("templates");

      click(action(el, entry.id, "cancel"));
      expect(action(el, entry.id, "replace")).toBeNull();
      expect(alertPanelState.draft.conditions).toEqual({ kind: "group", op: "all", of: [buildingRule] });
    });

    it("replaces the rule in progress once the trader confirms", () => {
      alertPanelState.setSingleCondition(buildingRule);
      const entry = ALERT_TEMPLATES[0];
      const el = render();

      click(action(el, entry.id, "load"));
      click(action(el, entry.id, "replace"));

      expect(alertPanelState.draft.conditions).toEqual(entry.conditions);
      expect(alertPanelState.activeTab).toBe("combo");
    });
  });
});
