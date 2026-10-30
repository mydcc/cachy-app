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
 * FEAT-0393 — the lifecycle footer, exercised through the DOM.
 *
 * These assert the *document* the controls write, not the markup, for the same
 * reason the builder-tab tests do: the document is what the core is handed. A
 * footer that looks right and writes `null` where the core expects the field to
 * be absent is a refusal the trader cannot act on.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import en from "../../locales/locales/en.json";
import RuleLifecycleFields from "./RuleLifecycleFields.svelte";
import { alertPanelState } from "../../stores/alertPanel.svelte";
import { locale } from "../../locales/i18n";
import { notificationPolicyStore } from "../../stores/notifications.svelte";
import { externalChannelsStore } from "../../stores/externalChannels.svelte";
import { notificationService } from "../../services/notificationService.svelte";

const dictionary = en as Record<string, unknown>;

function getNestedTranslation(path: string): string {
  let current: unknown = dictionary;
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object") return path;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : path;
}

vi.mock("../../locales/i18n", async () => {
  const { writable } = await import("svelte/store");
  // Interpolates `{name}` placeholders so the summary's formatted date is
  // observable, unlike the real `$_`, which would need a loaded dictionary.
  const translate = (key: string, options?: { values?: Record<string, unknown> }) => {
    let out = getNestedTranslation(key);
    for (const [name, value] of Object.entries(options?.values ?? {})) {
      out = out.replace(`{${name}}`, String(value));
    }
    return out;
  };
  return {
    _: writable(translate),
    locale: writable("en"),
  };
});

describe("FEAT-0393: RuleLifecycleFields", () => {
  let target: HTMLElement;
  let component: ReturnType<typeof mount> | null = null;

  beforeEach(() => {
    locale.set("en");
    target = document.createElement("div");
    document.body.appendChild(target);
    alertPanelState.reset("BTCUSDT");
    notificationPolicyStore.reset();
    externalChannelsStore.reload();
    notificationService.reset();
  });

  afterEach(() => {
    if (component) unmount(component);
    component = null;
    target.remove();
  });

  function render() {
    component = mount(RuleLifecycleFields, { target });
    flushSync();
    return target;
  }

  function checkbox(index: number): HTMLInputElement {
    const boxes = target.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    const box = boxes[index];
    if (!box) throw new Error(`no channel checkbox at ${index}`);
    return box;
  }

  function noteField(): HTMLTextAreaElement {
    const area = target.querySelector("textarea");
    if (!area) throw new Error("no note field");
    return area;
  }

  function expiryField(): HTMLInputElement {
    const input = target.querySelector<HTMLInputElement>('input[type="datetime-local"]');
    if (!input) throw new Error("no expiry field");
    return input;
  }

  it("starts on the frequency a rule had before the field existed", () => {
    render();
    const select = target.querySelector("select");
    expect(select?.value).toBe("once");
    expect(alertPanelState.draft.frequency).toBe("once");
  });

  it("writes the chosen frequency into the draft", () => {
    render();
    const select = target.querySelector("select");
    if (!select) throw new Error("no frequency select");

    select.value = "once_per_candle_close";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();

    expect(alertPanelState.draft.frequency).toBe("once_per_candle_close");
  });

  it("offers exactly the three channels that exist", () => {
    render();
    const labels = [...target.querySelectorAll(".method span")].map((s) => s.textContent);
    expect(labels).toEqual(["In-app", "Browser", "Sound"]);
  });

  it("offers an external channel only once it is configured and switched on", () => {
    render();
    expect(target.querySelectorAll('input[type="checkbox"]')).toHaveLength(3);

    externalChannelsStore.setDiscord({
      enabled: true,
      webhookUrl: "https://discord.com/api/webhooks/123456789/abcdefQWERTY-_",
      format: "minimal",
    });
    flushSync();

    const labels = [...target.querySelectorAll(".method span")].map((s) => s.textContent);
    expect(labels).toEqual(["In-app", "Browser", "Sound", "Discord"]);

    // A channel that is configured but paused is not offered: a tick that
    // delivers nothing is the silent alarm FEAT-0748 exists to prevent.
    externalChannelsStore.setDiscord({ enabled: false });
    flushSync();

    expect(target.querySelectorAll('input[type="checkbox"]')).toHaveLength(3);
  });

  it("names the channels the rule will actually use", () => {
    alertPanelState.draft.trigger_methods = ["in_app", "sound"];
    render();

    expect(target.querySelector(".effective-label")?.textContent).toContain(
      "Goes to In-app, Sound",
    );
  });

  it("acknowledges a test so an external-only set is not a dead button", () => {
    render();
    const button = target.querySelector<HTMLButtonElement>(".test-btn");
    if (!button) throw new Error("no test button");
    button.click();
    flushSync();

    expect(target.querySelector(".test-status")?.textContent).toContain(
      "Test dispatched to In-app",
    );
  });

  it("does not claim a second press sent anything", () => {
    render();
    const button = target.querySelector<HTMLButtonElement>(".test-btn");
    if (!button) throw new Error("no test button");

    button.click();
    flushSync();
    expect(target.querySelector(".test-status")?.textContent).toContain(
      "Test dispatched to In-app",
    );

    button.click();
    flushSync();
    expect(target.querySelector(".test-status")?.textContent).toContain(
      "Already tested a moment ago",
    );
  });

  it("does not carry a test result over to another draft", () => {
    render();
    const button = target.querySelector<HTMLButtonElement>(".test-btn");
    if (!button) throw new Error("no test button");
    button.click();
    flushSync();

    alertPanelState.reset("ETHUSDT");
    flushSync();

    expect(target.querySelector(".test-status")?.textContent?.trim()).toBe("");
  });

  it("names the effective set in the collapsed summary", () => {
    render();

    expect(target.querySelector(".summary-value")?.textContent).toContain("In-app");
  });

  it("says so when nothing would be announced", () => {
    notificationPolicyStore.setChannel("alert-fired", "in-app", false);
    render();

    expect(target.querySelector(".effective-label")?.textContent).toContain(
      "No channel is active",
    );
    expect(target.querySelector(".summary-value")?.textContent).toContain(
      "no active channel",
    );
    expect(target.querySelector<HTMLButtonElement>(".test-btn")?.disabled).toBe(true);
  });

  it("cannot claim a ticked channel inside a silenced category", () => {
    notificationPolicyStore.setChannel("alert-fired", "in-app", false);
    alertPanelState.draft.trigger_methods = ["browser"];
    render();

    expect(target.querySelector(".effective-label")?.textContent).toContain(
      "No channel is active",
    );
    expect(target.querySelector<HTMLButtonElement>(".test-btn")?.disabled).toBe(true);
  });

  it("keeps a paused channel visible so its tick can be removed", () => {
    externalChannelsStore.setDiscord({
      enabled: true,
      webhookUrl: "https://discord.com/api/webhooks/123456789/abcdefQWERTY-_",
      format: "minimal",
    });
    alertPanelState.draft.trigger_methods = ["discord"];
    render();

    expect(target.querySelectorAll('input[type="checkbox"]')).toHaveLength(4);

    externalChannelsStore.setDiscord({ enabled: false });
    flushSync();

    const labels = [...target.querySelectorAll(".method span")].map((s) => s.textContent);
    expect(labels).toContain("Discord");
    // Still operable so the choice can be removed; the hint says it will not
    // deliver right now.
    const boxes = target.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect(boxes[3].disabled).toBe(false);
    expect(target.textContent).toContain(
      "Paused — switch it on under Settings → Notifications",
    );

    boxes[3].click();
    flushSync();
    expect(alertPanelState.draft.trigger_methods).toEqual([]);
  });

  it("adds and removes a channel without disturbing the others", () => {
    render();

    checkbox(1).click();
    flushSync();
    expect(alertPanelState.draft.trigger_methods).toEqual(["browser"]);

    checkbox(2).click();
    flushSync();
    expect(alertPanelState.draft.trigger_methods).toEqual(["browser", "sound"]);

    checkbox(1).click();
    flushSync();
    expect(alertPanelState.draft.trigger_methods).toEqual(["sound"]);
  });

  it("never lists the same channel twice, which the core refuses", () => {
    render();

    checkbox(0).click();
    flushSync();
    checkbox(0).click();
    flushSync();
    checkbox(0).click();
    flushSync();

    const methods = alertPanelState.draft.trigger_methods ?? [];
    expect(methods).toEqual([...new Set(methods)]);
  });

  it("clears the note to absent rather than to an empty string", () => {
    render();
    const area = noteField();

    area.value = "entry on the retest";
    area.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
    expect(alertPanelState.draft.note).toBe("entry on the retest");

    // The core refuses a present-but-blank note. Clearing the field must mean
    // "no note", not "a note that says nothing".
    area.value = "   ";
    area.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
    expect(alertPanelState.draft.note).toBeUndefined();
  });

  it("round-trips an expiry through the local-time input", () => {
    render();
    const input = expiryField();

    input.value = "2026-12-24T18:30";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();

    const written = alertPanelState.draft.valid_until_ms;
    expect(written).toBeDefined();
    // Read back as local wall-clock time, which is what the trader typed.
    const at = new Date(written as number);
    expect(at.getFullYear()).toBe(2026);
    expect(at.getMonth()).toBe(11);
    expect(at.getDate()).toBe(24);
    expect(at.getHours()).toBe(18);
    expect(at.getMinutes()).toBe(30);
  });

  it("an emptied expiry means never expires", () => {
    render();
    const input = expiryField();

    input.value = "2026-12-24T18:30";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
    expect(alertPanelState.draft.valid_until_ms).toBeDefined();

    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
    expect(alertPanelState.draft.valid_until_ms).toBeUndefined();
  });

  it("treats an incomplete date the same as an empty one", () => {
    render();
    const input = expiryField();

    input.value = "2026-12-24T18:30";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
    expect(alertPanelState.draft.valid_until_ms).toBeDefined();

    // A `datetime-local` input reports "" for input it cannot parse, so a
    // half-typed date is indistinguishable from a cleared field. Pinned
    // because it is surprising: there is no garbage-string case to guard, and
    // a guard written for one would never run.
    input.value = "2026-12-";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();

    expect(input.value).toBe("");
    expect(alertPanelState.draft.valid_until_ms).toBeUndefined();
  });

  it("shows the expiry in the app's language, not the browser's", () => {
    // Local-time construction so the calendar day cannot roll over by zone.
    alertPanelState.draft.valid_until_ms = new Date(2026, 11, 24, 18, 30).getTime();

    locale.set("de");
    render();
    const german = target.querySelector("summary")?.textContent ?? "";

    locale.set("en");
    flushSync();
    const english = target.querySelector("summary")?.textContent ?? "";

    // `toLocaleString()` followed the OS locale; the summary now follows the
    // app's, so a German UI shows a German date on an English machine and the
    // English UI a month name.
    expect(german).toContain("24.12.2026");
    expect(english).toContain("Dec 24");
  });
});
