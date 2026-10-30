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
 * FEAT-0749 — the bots tab, moved out of the settings Automation tab.
 *
 * These cases came over with the code: each one pins a refusal or an edit
 * path that a move could plausibly break, which is why they run against the
 * new home rather than being retyped against a copy.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import en from "../../../locales/locales/en.json";
import de from "../../../locales/locales/de.json";
import type { RuleDocument } from "../../../lib/rules/types";

const mocks = vi.hoisted(() => ({
  armRule: vi.fn(),
  promoteAlertToBot: vi.fn(),
  readRuleStore: vi.fn(),
  validate: vi.fn(),
}));

vi.mock("../../../services/alertEngine/armRule", () => ({
  armRule: mocks.armRule,
  readRuleStore: mocks.readRuleStore,
  RuleConflictError: class RuleConflictError extends Error {
    readonly translationKey = "settings.automation.botChanged";
  },
}));

vi.mock("../../../services/alertEngine/promoteAlert", () => ({
  promoteAlertToBot: mocks.promoteAlertToBot,
}));

vi.mock("../../../services/alertEngine/botStore", () => ({
  deleteBot: vi.fn(),
  isBot: (rule: RuleDocument) => rule.action?.consequence_level === "simulate",
  setBotEnabled: vi.fn(),
}));

vi.mock("../../../lib/rules/ruleSchema", () => ({
  isRuleRefusedError: (error: unknown) => error instanceof Error && error.name === "RuleRefusedError",
  ruleSchema: { validate: mocks.validate },
}));

vi.mock("../../../services/logger", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() },
}));

vi.mock("../../../locales/i18n", async () => {
  const { readable } = await import("svelte/store");
  const translate = (key: string, options?: { values?: Record<string, unknown> }) => {
    let value: unknown = en;
    for (const part of key.split(".")) {
      value = (value as Record<string, unknown>)?.[part];
    }
    if (typeof value !== "string") return key;
    return Object.entries(options?.values ?? {}).reduce(
      (text, [name, replacement]) => text.replaceAll(`{${name}}`, String(replacement)),
      value,
    );
  };
  return { _: readable(translate), locale: readable("en") };
});

import BotsTab from "./BotsTab.svelte";
import { alertState } from "../../../stores/alerts.svelte";

const alert: RuleDocument = {
  schema_version: 2,
  id: "alert-1",
  name: "Breakout alert",
  symbol: "BTCUSDT",
  trigger_timeframe: "1h",
  conditions: {
    kind: "compare",
    left: { kind: "price", field: "close" },
    op: "gte",
    right: { kind: "constant", value: "50000" },
    timeframe: "1h",
  },
  action: { consequence_level: "notify" },
  enabled: true,
  provenance: { source: "human", created_at_ms: 0 },
};

function bot(stop?: { basis: "percent_of_entry"; distance: string }): RuleDocument {
  return {
    ...alert,
    id: "bot-1",
    name: "Breakout bot",
    action: {
      consequence_level: "simulate",
      order: {
        side: "buy",
        size_basis: "percent_of_equity",
        size: "1",
        ...(stop ? { stop } : {}),
      },
    },
    enabled: false,
    provenance: { source: "human", created_at_ms: 1, derived_from_hash: "a".repeat(64) },
  };
}

function translation(bundle: Record<string, unknown>, key: string): string {
  return key
    .split(".")
    .reduce<unknown>((value, part) => (value as Record<string, unknown>)?.[part], bundle) as string;
}

let host: HTMLElement;
let component: ReturnType<typeof mount> | null = null;
let storedRules: RuleDocument[] = [];

function render() {
  component = mount(BotsTab, { target: host });
  flushSync();
}

function setInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  flushSync();
}

function button(label: string): HTMLButtonElement {
  const match = [...host.querySelectorAll("button")].find((element) => element.textContent?.trim() === label);
  if (!match) throw new Error(`button not found: ${label}`);
  return match as HTMLButtonElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  storedRules = [alert];
  mocks.readRuleStore.mockImplementation(() => storedRules);
  mocks.validate.mockImplementation((document: RuleDocument) => document);
  mocks.armRule.mockImplementation((document: RuleDocument) => {
    storedRules = storedRules.map((rule) => (rule.id === document.id ? document : rule));
    return storedRules;
  });
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  if (component) unmount(component);
  component = null;
  host.remove();
});

describe("BotsTab order intent", () => {
  it("refuses promotion without a stop before writing a bot", () => {
    render();
    const stop = host.querySelector("#promote-stop-distance") as HTMLInputElement;
    setInput(stop, "");
    button(translation(en as Record<string, unknown>, "settings.automation.promote")).click();
    flushSync();

    expect(mocks.promoteAlertToBot).not.toHaveBeenCalled();
    expect(stop.getAttribute("aria-invalid")).toBe("true");
    expect(host.textContent).toContain(
      translation(en as Record<string, unknown>, "settings.automation.stopRequired"),
    );
  });

  it("passes a stop distance with the promoted order", () => {
    render();
    setInput(host.querySelector("#promote-stop-distance") as HTMLInputElement, "2");
    button(translation(en as Record<string, unknown>, "settings.automation.promote")).click();

    expect(mocks.promoteAlertToBot).toHaveBeenCalledWith("alert-1", {
      side: "buy",
      size_basis: "percent_of_equity",
      size: "1",
      stop: { basis: "percent_of_entry", distance: "2" },
    });
  });

  it("shows the source alert condition in the promote dropdown", () => {
    render();
    const option = host.querySelector('option[value="alert-1"]') as HTMLOptionElement;
    expect(option.textContent).toContain("50000");
  });

  it("marks a stored bot without a stop as non-submittable", () => {
    storedRules = [bot()];
    render();
    expect(host.textContent).toContain(
      translation(en as Record<string, unknown>, "settings.automation.noStop"),
    );
  });

  it("does not open an editor for a reduce-only bot", () => {
    const base = bot({ basis: "percent_of_entry", distance: "2" });
    storedRules = [{
      ...base,
      action: {
        ...base.action,
        order: { ...base.action.order!, reduce_only: true },
      },
    }];
    render();

    expect(
      [...host.querySelectorAll("button")].some(
        (element) => element.textContent?.trim() === translation(en as Record<string, unknown>, "settings.automation.edit"),
      ),
    ).toBe(false);
  });

  it("does not recreate a bot deleted in another tab", () => {
    storedRules = [bot({ basis: "percent_of_entry", distance: "2" })];
    render();
    button(translation(en as Record<string, unknown>, "settings.automation.edit")).click();
    flushSync();
    storedRules = [];
    button(translation(en as Record<string, unknown>, "settings.automation.save")).click();
    flushSync();

    expect(mocks.armRule).not.toHaveBeenCalled();
  });

  it("anchors a size refusal to the size field", () => {
    storedRules = [bot({ basis: "percent_of_entry", distance: "2" })];
    mocks.validate.mockImplementationOnce(() => {
      const error = Object.assign(new Error("refused"), {
        name: "RuleRefusedError",
        refusals: [{ field: "action.order.size", i18n_key: "rules.refusal.sizeMustBePositive" }],
        translationKey: "rules.refusal.sizeMustBePositive",
      });
      throw error;
    });
    render();
    button(translation(en as Record<string, unknown>, "settings.automation.edit")).click();
    flushSync();
    button(translation(en as Record<string, unknown>, "settings.automation.save")).click();
    flushSync();

    const size = host.querySelector("#bot-edit-size-bot-1") as HTMLInputElement;
    const stop = host.querySelector("#bot-edit-stop-distance-bot-1") as HTMLInputElement;
    expect(size.getAttribute("aria-invalid")).toBe("true");
    expect(size.getAttribute("aria-describedby")).toBe("bot-edit-refusal-size");
    expect(stop.getAttribute("aria-invalid")).toBe("false");
    expect(host.querySelector("#bot-edit-refusal-size")).not.toBeNull();
  });

  it("edits and revalidates a bot under the same id", () => {
    storedRules = [bot({ basis: "percent_of_entry", distance: "2" })];
    render();
    button(translation(en as Record<string, unknown>, "settings.automation.edit")).click();
    flushSync();

    setInput(host.querySelector("#bot-edit-size-bot-1") as HTMLInputElement, "2");
    setInput(host.querySelector("#bot-edit-stop-distance-bot-1") as HTMLInputElement, "3");
    button(translation(en as Record<string, unknown>, "settings.automation.save")).click();
    flushSync();

    expect(mocks.validate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "bot-1",
        action: expect.objectContaining({
          order: expect.objectContaining({ size: "2", stop: { basis: "percent_of_entry", distance: "3" } }),
        }),
      }),
    );
    expect(mocks.armRule).toHaveBeenCalledWith(
      expect.objectContaining({ id: "bot-1", action: expect.objectContaining({ order: expect.objectContaining({ size: "2" }) }) }),
      expect.objectContaining({ id: "bot-1", action: expect.objectContaining({ order: expect.objectContaining({ size: "1" }) }) }),
    );
    expect(host.textContent).toContain("with a stop 3% from the entry");
  });

  it("picks up a bot promoted while the tab is open", () => {
    render();
    expect(host.textContent).toContain(
      translation(en as Record<string, unknown>, "settings.automation.noBots"),
    );

    // The desk stays open while the Super-Alert panel promotes an alert; the
    // bump is what the writer does, and this is the read that has to follow.
    storedRules = [bot({ basis: "percent_of_entry", distance: "2" })];
    alertState.rulesVersion += 1;
    flushSync();

    expect(host.textContent).toContain("Breakout bot");
  });

  it("keeps the new automation strings available in German", () => {
    expect(translation(de as Record<string, unknown>, "settings.automation.stopRequired")).not.toBe("");
    expect(translation(de as Record<string, unknown>, "settings.automation.noStop")).not.toBe("");
  });
});
