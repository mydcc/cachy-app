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
  // The real stopAllBots iterates the store; this harness already owns what
  // the store would read (storedRules), so the mock serves the same rows —
  // a `vi.fn` so one case can also answer the way an unreadable store does.
  readBots: vi.fn(() => storedRules.filter((rule) => rule.action?.consequence_level === "simulate")),
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
import { readBots, setBotEnabled } from "../../../services/alertEngine/botStore";
import { recordBotGuard } from "../../../services/alertEngine/botGuardStore";
import { alertState } from "../../../stores/alerts.svelte";
import { settingsState } from "../../../stores/settings.svelte";

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

/*
 * FEAT-0804 — the tab opened with three paragraphs of help above the first
 * control. The one line a trader must read before trusting the page stays a
 * sentence; the explanations moved behind the marker.
 */
describe("FEAT-0804 — the tab leads with sentences, not paragraphs", () => {
  const text = (key: string) => translation(en as Record<string, unknown>, key);

  /** The keyboard path: focus the marker and read what it reveals. */
  function revealedHelp(testId: string): string {
    const line = host.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
    expect(line, testId).not.toBeNull();
    const trigger = line!.querySelector<HTMLElement>(".tooltip-container");
    expect(trigger, `${testId} has no focusable help trigger`).not.toBeNull();
    trigger!.focus();
    flushSync();
    const tooltip = line!.querySelector<HTMLElement>('[role="tooltip"]');
    expect(tooltip, `${testId} revealed nothing on focus`).not.toBeNull();
    return (tooltip!.textContent ?? "").trim();
  }

  it("keeps the simulated-only fact visible and its explanation behind the marker", () => {
    render();

    const line = host.querySelector<HTMLElement>('[data-testid="bots-simulate-only"]');
    expect(line, "the simulated-only line is gone").not.toBeNull();
    expect(line!.textContent).toContain(text("settings.automation.simulateOnlyShort"));
    // The paragraph itself is not on the page until the marker is opened.
    expect(host.textContent).not.toContain(text("settings.automation.simulateOnly"));
    expect(revealedHelp("bots-simulate-only")).toContain(text("settings.automation.simulateOnly"));
  });

  it("moves the intro and the promotion semantics behind the marker", () => {
    render();

    const cases = [
      ["bots-intro", "settings.automation.intro", "settings.automation.introShort"],
      ["promote-hint", "settings.automation.promoteHint", "settings.automation.promoteHintShort"],
    ] as const;

    for (const [testId, fullKey, shortKey] of cases) {
      const line = host.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
      expect(line, testId).not.toBeNull();
      expect(line!.textContent).toContain(text(shortKey));
      expect(host.textContent).not.toContain(text(fullKey));
      expect(revealedHelp(testId)).toContain(text(fullKey));
    }
  });

  it("keeps the simulated-only sentence when help is switched off", () => {
    // `InfoTip` renders nothing without tooltips, by design. The safety claim is
    // a plain sentence for exactly that reason, and this is what notices if
    // someone folds it into the marker later.
    const previous = settingsState.showTooltips;
    settingsState.showTooltips = false;
    try {
      render();
      const line = host.querySelector<HTMLElement>('[data-testid="bots-simulate-only"]');
      expect(line, "the simulated-only line disappears without tooltips").not.toBeNull();
      expect(line!.textContent).toContain(text("settings.automation.simulateOnlyShort"));
      expect(host.querySelector(".info-tip")).toBeNull();
    } finally {
      settingsState.showTooltips = previous;
    }
  });
});

describe("FEAT-0822 — stop-all and the guard history", () => {
  function storedBot(id: string): RuleDocument {
    return { ...bot({ basis: "percent_of_entry", distance: "2" }), id, enabled: true };
  }

  it("stop all disables every enabled bot and bumps the version", () => {
    storedRules = [storedBot("bot-1"), storedBot("bot-2")];
    const versionBefore = alertState.rulesVersion;
    render();

    button(translation(en as Record<string, unknown>, "settings.automation.stopAll")).click();
    flushSync();

    // The real stopAllBots runs against the mocked store readers: one write
    // per enabled bot, and the rules version is what re-renders the rows.
    expect(vi.mocked(setBotEnabled)).toHaveBeenCalledWith("bot-1", false);
    expect(vi.mocked(setBotEnabled)).toHaveBeenCalledWith("bot-2", false);
    expect(alertState.rulesVersion).toBeGreaterThan(versionBefore);
  });

  it("offers stop-all only when bots exist", () => {
    storedRules = [alert];
    render();

    const stopAll = [...host.querySelectorAll("button")].find(
      (element) =>
        element.textContent?.trim() ===
        translation(en as Record<string, unknown>, "settings.automation.stopAll"),
    );
    expect(stopAll).toBeUndefined();
  });

  it("stop all survives an unreadable rule store and stops nothing", () => {
    storedRules = [storedBot("bot-1")];
    render();

    // The store's unreadable blob is a routine degradation — Stop-all must
    // answer 0 and report it, never surface as an unhandled rejection from
    // the click that triggered it.
    vi.mocked(readBots).mockImplementationOnce(() => {
      throw new Error("rule store is not readable");
    });

    expect(() =>
      button(translation(en as Record<string, unknown>, "settings.automation.stopAll")).click(),
    ).not.toThrow();
    flushSync();

    expect(vi.mocked(setBotEnabled)).not.toHaveBeenCalled();
  });

  it("renders the guard history newest first, one row per reason, counting repeats", () => {
    storedRules = [storedBot("bot-1")];
    render();
    expect(host.querySelector('[data-testid="bot-guard-history-bot-1"]')).toBeNull();

    recordBotGuard("bot-1", "slot-reserved", 0);
    recordBotGuard("bot-1", "limit-entries-day", 60_000);
    recordBotGuard("bot-1", "limit-entries-day", 120_000);
    alertState.guardsVersion += 1;
    flushSync();

    const details = host.querySelector<HTMLElement>('[data-testid="bot-guard-history-bot-1"]');
    expect(details).not.toBeNull();
    expect(details!.textContent).toContain("Guard history (2");

    const rows = [...details!.querySelectorAll("li")];
    expect(rows).toHaveLength(2);
    // Newest reason first, repeats counted on the row that owns them.
    expect(rows[0].textContent).toContain(
      translation(en as Record<string, unknown>, "botsList.guard.limitEntriesDay"),
    );
    expect(rows[0].textContent).toContain("×2");
    expect(rows[1].textContent).toContain(
      translation(en as Record<string, unknown>, "botsList.guard.slotReserved"),
    );
    expect(rows[1].textContent).toContain("×1");
  });
});

describe("FEAT-0822 review — the guard history renders every row", () => {
  it("an alternating history opens a second row per reason and still renders", () => {
    // This file's beforeEach clears mocks but not storage, and the guard
    // ledger survives between cases — start this one's history empty so
    // the row count is this case's alone.
    localStorage.clear();
    storedRules = [bot({ basis: "percent_of_entry", distance: "2" })];
    render();

    // The ledger's deliberate shape: a reason that recurs after another
    // intervened opens a NEW row (pinned in botGuardStore.test) — two
    // `limit-entries-day` rows with different firsts. A key of the reason
    // alone would throw `each_key_duplicate` on exactly this history.
    recordBotGuard("bot-1", "limit-entries-day", 0);
    recordBotGuard("bot-1", "slot-reserved", 1);
    recordBotGuard("bot-1", "limit-entries-day", 2);
    alertState.guardsVersion += 1;
    flushSync();

    const details = host.querySelector<HTMLElement>('[data-testid="bot-guard-history-bot-1"]');
    expect(details).not.toBeNull();
    const rows = [...details!.querySelectorAll("li")];
    expect(rows).toHaveLength(3);
    expect(rows.filter((row) => row.textContent?.includes("×1"))).toHaveLength(3);
  });
});
