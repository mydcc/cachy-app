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
 * FEAT-0814 -- authoring a veto: add, edit, remove, a feed leaf, and the two
 * promises that opening the section writes nothing and that "no veto" is the
 * absence of the field.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";

import en from "../../../locales/locales/en.json";
import VetoSection from "./VetoSection.svelte";
import { alertPanelState } from "../../../stores/alertPanel.svelte";
import type { SentenceTranslator } from "../../../lib/rules/ruleSentence";
import type { Condition } from "../../../lib/rules/types";

const dictionary = en as Record<string, unknown>;

function lookup(path: string): string {
  let current: unknown = dictionary;
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object") return path;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : path;
}

function fill(raw: string, values?: Record<string, unknown>): string {
  return raw.replace(/\{(\w+)\}/g, (_m, name: string) => String(values?.[name] ?? `{${name}}`));
}

vi.mock("../../../locales/i18n", () => {
  const translate = (key: string, opts?: { values?: Record<string, unknown> }) =>
    fill(lookup(key), opts?.values);
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

const translate: SentenceTranslator = (key, values) => fill(lookup(key), values);

/** A shape the price leaf can represent, so the veto opens editable. */
const closeAbove = (value: string): Condition => ({
  kind: "cross",
  left: { kind: "price", field: "close" },
  direction: "above",
  right: { kind: "constant", value },
  timeframe: "1h",
});

const plain = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe("FEAT-0814: the veto section", () => {
  let target: HTMLElement;
  let mounted: ReturnType<typeof mount> | null = null;

  beforeEach(() => {
    target = document.createElement("div");
    document.body.appendChild(target);
    alertPanelState.reset("BTCUSDT");
  });

  afterEach(() => {
    if (mounted) unmount(mounted);
    mounted = null;
    target.remove();
  });

  function open(): HTMLElement {
    mounted = mount(VetoSection, { target, props: { translate } });
    flushSync();
    return target;
  }

  function testid(el: HTMLElement, id: string): HTMLElement {
    const found = el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    if (!found) throw new Error(`no [data-testid="${id}"]`);
    return found;
  }

  function chooseKind(el: HTMLElement, kind: string): void {
    const select = testid(el, "combo-leaf").querySelector<HTMLSelectElement>("select");
    if (!select) throw new Error("no kind select");
    select.value = kind;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();
  }

  it("shows an explicit no-veto state and leaves the document without the field", () => {
    const el = open();
    expect(testid(el, "veto-empty")).toBeTruthy();
    expect("veto" in alertPanelState.draft).toBe(false);
  });

  it("adds a veto, edits it into a feed, and writes an external_feed condition", () => {
    const el = open();
    testid(el, "veto-add").click();
    flushSync();
    expect(alertPanelState.draft.veto?.kind).toBe("group");

    chooseKind(el, "feed");
    // FEAT-0816 — the feed is wired now, so the leaf states its unit instead
    // of warning that no source delivers it. A trader who reads "0.0005 is
    // 0.05%" writes a funding threshold that can actually hold.
    expect(el.querySelector('[data-testid="feed-unwired"]')).toBeNull();
    expect(testid(el, "feed-unit").textContent).toContain(
      lookup("rules.sentence.feedUnit.funding_rate"),
    );
    // No threshold yet: the feed leaf is left out and arming is held.
    expect(alertPanelState.incompleteVeto).toBe(true);

    const input = testid(el, "combo-leaf").querySelector<HTMLInputElement>('input[inputmode="decimal"]');
    if (!input) throw new Error("no feed threshold input");
    input.value = "0.010";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();

    expect(alertPanelState.incompleteVeto).toBe(false);
    expect(plain(alertPanelState.draft.veto)).toEqual({
      kind: "group",
      op: "all",
      of: [{ kind: "external_feed", feed: "funding_rate", op: "gt", value: "0.01" }],
    });
    expect(testid(el, "veto-sentence").textContent).toContain(lookup("rules.sentence.feed.funding_rate"));
  });

  it("removes the veto by deleting the field, not by writing an empty group", () => {
    alertPanelState.draft.veto = { kind: "group", op: "all", of: [closeAbove("150")] };
    const el = open();
    testid(el, "veto-remove").click();
    flushSync();
    expect("veto" in alertPanelState.draft).toBe(false);
    expect(testid(el, "veto-empty")).toBeTruthy();
  });

  it("opens a stored bare-leaf veto without rewriting it", () => {
    const bare = closeAbove("150");
    alertPanelState.draft.veto = bare;
    const el = open();
    expect(el.querySelectorAll('[data-testid="combo-leaf"]')).toHaveLength(1);
    expect(plain(alertPanelState.draft.veto)).toEqual(bare);
  });

  it("locks a veto it cannot represent, keeps it, and still lets the trader remove it", () => {
    const nor: Condition = { kind: "group", op: "none", of: [closeAbove("150")] };
    alertPanelState.draft.veto = nor;
    const el = open();
    expect(testid(el, "veto-locked")).toBeTruthy();
    expect(plain(alertPanelState.draft.veto)).toEqual(nor);

    testid(el, "veto-remove").click();
    flushSync();
    expect("veto" in alertPanelState.draft).toBe(false);
    expect(el.querySelector('[data-testid="veto-locked"]')).toBeNull();
  });

  it("moves an untouched veto with the trigger timeframe, as Combo does", () => {
    const tf = alertPanelState.draft.trigger_timeframe;
    alertPanelState.draft.veto = { kind: "group", op: "all", of: [{ ...closeAbove("150"), timeframe: tf } as Condition] };
    open();
    const next = tf === "4h" ? "1d" : "4h";
    alertPanelState.draft.trigger_timeframe = next;
    flushSync();
    const veto = plain(alertPanelState.draft.veto);
    if (veto?.kind !== "group") throw new Error("expected a group veto");
    expect((veto.of[0] as { timeframe: string }).timeframe).toBe(next);
  });

  it("anchors a refusal on the veto leaf the core named", () => {
    alertPanelState.draft.veto = { kind: "group", op: "all", of: [closeAbove("150"), closeAbove("160")] };
    const el = open();
    alertPanelState.refusals = [
      { code: "x", field: "veto.of[1]", i18n_key: "rules.refusal.test_refusal", detail: "test" },
    ];
    flushSync();
    const leaves = el.querySelectorAll('[data-testid="combo-leaf"]');
    expect(leaves[0].querySelector(".refusal")).toBeNull();
    expect(leaves[1].querySelector(".refusal")?.textContent).toBe("rules.refusal.test_refusal");
  });
});
