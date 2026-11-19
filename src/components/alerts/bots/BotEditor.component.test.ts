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
 * FEAT-0811 — the bot editor, both modes, against the real components and
 * the real sections.
 *
 * The store and the core are mocked (the `BotsTab` harness's discipline):
 * what is under test is the editor's own contract — the fields it asks, the
 * document it assembles from them, the refusals it anchors to the field that
 * earned them, and the two creation paths' distinct save routes.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";

import en from "../../../locales/locales/en.json";
import de from "../../../locales/locales/de.json";
import type { RuleDocument } from "../../../lib/rules/types";

const mocks = vi.hoisted(() => ({
    armRule: vi.fn(),
    createBotDraft: vi.fn(),
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
    createBotDraft: mocks.createBotDraft,
}));

vi.mock("../../../lib/rules/ruleSchema", () => ({
    isRuleRefusedError: (error: unknown) =>
        error instanceof Error && error.name === "RuleRefusedError",
    ruleSchema: { validate: mocks.validate },
}));

vi.mock("../../../services/logger", () => ({
    logger: { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() },
}));

vi.mock("../../../locales/i18n", async () => {
    const { readable } = await import("svelte/store");
    const translate = (
        key: string,
        options?: { values?: Record<string, unknown> },
    ) => {
        let value: unknown = en;
        for (const part of key.split(".")) {
            value = (value as Record<string, unknown> | undefined)?.[part];
        }
        if (typeof value !== "string") return key;
        return Object.entries(options?.values ?? {}).reduce(
            (text, [name, replacement]) => text.replaceAll(`{${name}}`, String(replacement)),
            value,
        );
    };
    return { _: readable(translate), locale: readable("en") };
});

import BotEditor from "./BotEditor.svelte";

/** Resolves a dotted key against a locale bundle, or undefined. */
function lookup(bundle: unknown, key: string): unknown {
    return key
        .split(".")
        .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], bundle);
}

/** A stored bot with one exit and one target — the edit-mode fixture. */
function storedBot(overrides: Partial<RuleDocument> = {}): RuleDocument {
    return {
        schema_version: 5,
        id: "bot-1",
        name: "Breakout bot",
        symbol: "BTCUSDT",
        trigger_timeframe: "1h",
        conditions: {
            kind: "compare",
            left: { kind: "price", field: "close" },
            op: "gte",
            right: { kind: "constant", value: "50000" },
            timeframe: "1h",
        },
        action: {
            consequence_level: "simulate",
            order: {
                side: "buy",
                size_basis: "percent_of_equity",
                size: "1",
                stop: { basis: "percent_of_entry", distance: "2" },
            },
        },
        enabled: true,
        provenance: { source: "human", created_at_ms: 0 },
        exits: [
            {
                when: {
                    kind: "compare",
                    left: { kind: "price", field: "close" },
                    op: "gte",
                    right: { kind: "constant", value: "60000" },
                    timeframe: "1h",
                },
                close: "all",
            },
        ],
        take_profit: { basis: "percent_of_entry", distance: "5" },
        ...overrides,
    } as RuleDocument;
}

let host: HTMLElement;
let component: ReturnType<typeof mount> | null = null;

function render(bot: RuleDocument | null) {
    component = mount(BotEditor, {
        target: host,
        props: { bot, onsaved: vi.fn(), oncancel: vi.fn() },
    });
    flushSync();
    return component;
}

function input(id: string): HTMLInputElement {
    const element = host.querySelector<HTMLInputElement>(`#${id}`);
    if (!element) throw new Error(`no #${id} in the editor`);
    return element;
}

function select(id: string): HTMLSelectElement {
    const element = host.querySelector<HTMLSelectElement>(`#${id}`);
    if (element) return element;
    throw new Error(`no #${id} in the editor`);
}

function setInput(element: HTMLInputElement | HTMLSelectElement, value: string): void {
    element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();
}

/** The repository's select idiom (`AlertPanelView.component.test.ts`):
 * the change event alone — a dispatched `input` first is what the Svelte 5
 * select binding does not survive. */
function setSelect(element: HTMLSelectElement, value: string): void {
    element.value = value;
    element.dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();
}

/** The Save button — found by its label, the way a trader finds it. */
function save(): void {
    const button = [...host.querySelectorAll("button")].find(
        (element) => element.textContent?.trim() === lookup(en, "settings.automation.save"),
    );
    if (!button) throw new Error("no save button");
    button.click();
    flushSync();
}

/** The exit section's add button, by its label. */
function addExit(): void {
    const button = [...host.querySelectorAll("button")].find(
        (element) =>
            element.textContent?.trim() === lookup(en, "settings.automation.editor.exitAdd"),
    );
    if (!button) throw new Error("no add-exit button");
    button.click();
    flushSync();
}

/** The refusal line's text, or null when none renders. */
function refusalText(): string | null {
    const element = host.querySelector('[role="alert"]');
    return element?.textContent?.trim() ?? null;
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.validate.mockImplementation((document: RuleDocument) => document);
    mocks.armRule.mockImplementation((rules: RuleDocument[]) => rules);
    mocks.readRuleStore.mockReturnValue([storedBot()]);
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component);
    component = null;
    host.remove();
});

describe("create mode (FEAT-0811 AC 1)", () => {
    it("renders the direct-creation fields no alert ever asked", () => {
        render(null);

        for (const id of [
            "bot-create-name",
            "bot-create-symbol",
            "bot-create-timeframe",
            "bot-create-entry-field",
            "bot-create-entry-value",
            "bot-create-stop-distance",
            "bot-create-take-profit",
        ]) {
            expect(host.querySelector(`#${id}`)).not.toBeNull();
        }
    });

    it("assembles the answers into an unarmed draft through the service", () => {
        render(null);

        setInput(input("bot-create-name"), "my bot");
        setInput(input("bot-create-symbol"), "ETHUSDT");
        setInput(input("bot-create-entry-value"), "3000");
        setInput(input("bot-create-stop-distance"), "2");

        save();

        expect(mocks.createBotDraft).toHaveBeenCalledTimes(1);
        const fields = mocks.createBotDraft.mock.calls[0][0] as Record<string, unknown>;
        expect(fields.symbol).toBe("ETHUSDT");
        expect(fields.trigger_timeframe).toBe("1h");
        // The entry condition is the compact price-compare the form promised.
        expect(fields.conditions).toEqual({
            kind: "compare",
            left: { kind: "price", field: "close" },
            op: "gte",
            right: { kind: "constant", value: "3000" },
            timeframe: "1h",
        });
        // No exits were authored: the draft carries none, never an empty array.
        expect(fields.exits).toBeUndefined();
        // The store write is the service's alone — the editor never arms.
        expect(mocks.armRule).not.toHaveBeenCalled();
    });

    it("refuses an empty symbol anchored to the symbol field", () => {
        render(null);

        setInput(input("bot-create-entry-value"), "3000");
        setInput(input("bot-create-stop-distance"), "2");
        save();

        expect(mocks.createBotDraft).not.toHaveBeenCalled();
        expect(input("bot-create-symbol").getAttribute("aria-invalid")).toBe("true");
        expect(refusalText()).toBe(lookup(en, "settings.automation.editor.symbolRequired"));
    });

    it("refuses a missing stop before anything is assembled", () => {
        render(null);

        setInput(input("bot-create-symbol"), "ETHUSDT");
        setInput(input("bot-create-entry-value"), "3000");
        save();

        expect(mocks.createBotDraft).not.toHaveBeenCalled();
        expect(refusalText()).toBe(lookup(en, "settings.automation.stopRequired"));
        expect(input("bot-create-stop-distance").getAttribute("aria-invalid")).toBe("true");
    });
});

describe("the exits section (FEAT-0811 AC 2, 3, 6, 8)", () => {
    it("renders each stored exit with its live sentence", () => {
        render(storedBot());

        const sentences = [...host.querySelectorAll('[data-testid="exit-row-sentence"]')];
        expect(sentences).toHaveLength(1);
        // The same vocabulary the sidebar will read the exit back with.
        expect(sentences[0].textContent).toContain("at least 60000");
    });

    it("round-trips the exits and the target through save (AC 2)", () => {
        render(storedBot());

        save();

        expect(mocks.validate).toHaveBeenCalledTimes(1);
        const document = mocks.validate.mock.calls[0][0] as RuleDocument;
        expect(document.exits).toEqual(storedBot().exits);
        expect(document.take_profit).toEqual({ basis: "percent_of_entry", distance: "5" });
        expect(mocks.armRule).toHaveBeenCalledTimes(1);
    });

    it("refuses a partial exit without a fraction, anchored to the row (AC 3)", () => {
        render(null);
        setInput(input("bot-create-symbol"), "ETHUSDT");
        setInput(input("bot-create-entry-value"), "3000");
        setInput(input("bot-create-stop-distance"), "2");

        addExit();
        // Everything else the form answers is answered, so the missing
        // fraction is the only defect left to earn the refusal.
        setInput(input("bot-create-exit-0-value"), "4000");
        setSelect(select("bot-create-exit-0-close"), "partial");

        save();

        expect(mocks.createBotDraft).not.toHaveBeenCalled();
        expect(input("bot-create-exit-0-fraction").getAttribute("aria-invalid")).toBe("true");
        expect(refusalText()).toBe(lookup(en, "settings.automation.editor.fractionRequired"));
    });

    it("anchors the core's fraction refusal to the same row (AC 3, core half)", () => {
        render(storedBot());

        // The stored row closes all — flip it to partial so the fraction
        // input exists, then hand the core a value the pre-check cannot
        // catch (out of range): the core refuses, and its field path is
        // the anchor that must land on this row.
        setSelect(select("bot-edit-exit-0-close"), "partial");
        setInput(input("bot-edit-exit-0-fraction"), "1.5");

        const refusal = Object.assign(new Error("refused"), {
            name: "RuleRefusedError",
            refusals: [
                {
                    field: "exits[0].fraction",
                    i18n_key: "rules.refusal.exitFractionInvalid",
                    translationKey: "rules.refusal.exitFractionInvalid",
                },
            ],
            translationKey: "rules.refusal.exitFractionInvalid",
        });
        mocks.validate.mockImplementationOnce(() => {
            throw refusal;
        });

        save();

        expect(input("bot-edit-exit-0-fraction").getAttribute("aria-invalid")).toBe("true");
        // The message carries the anchor in its {field} slot — the same
        // substitution the translator performs.
        expect(refusalText()).toBe(
            String(lookup(en, "rules.refusal.exitFractionInvalid")).replaceAll(
                "{field}",
                "bot-edit-exit-0-fraction",
            ),
        );
    });

    it("removing the last exit leaves the document with no exits key (AC 8)", () => {
        render(storedBot());

        const remove = [...host.querySelectorAll("button")].find(
            (element) =>
                element.textContent?.trim() === lookup(en, "settings.automation.editor.exitRemove"),
        );
        remove!.click();
        flushSync();

        save();

        const document = mocks.validate.mock.calls[0][0] as RuleDocument;
        expect("exits" in document).toBe(false);
    });

    it("labels the section for the side the bot takes, in both locales (AC 6)", () => {
        render(storedBot({ action: { ...storedBot().action } }));

        // A long's exits read one way; the short's the mirrored way.
        expect(host.textContent).toContain(lookup(en, "settings.automation.editor.exitsTitleLong"));
        expect(lookup(de, "settings.automation.editor.exitsTitleLong")).toContain("Long");
        expect(lookup(de, "settings.automation.editor.exitsTitleShort")).toContain("Short");
        // The side-aware target hint, mirrored in both bundles.
        expect(lookup(de, "settings.automation.editor.takeProfitSideLong")).toContain("Long");
        expect(lookup(de, "settings.automation.editor.takeProfitSideShort")).toContain("Short");
    });
});

describe("the firing section (FEAT-0811 AC 4; FEAT-0823 AC 7)", () => {
    it("carries the confirmation trade-off the moment the mode is chosen", () => {
        render(null);

        setSelect(select("bot-create-entry-trigger"), "confirmation");

        const tradeoff = host.querySelector('[data-testid="trigger-tradeoff"]');
        expect(tradeoff?.textContent).toContain(
            String(lookup(en, "settings.automation.editor.triggerTradeoff")),
        );
        // And both locales state it — FEAT-0823 deferred this sentence to
        // exactly this surface.
        expect(lookup(de, "settings.automation.editor.triggerTradeoff")).toContain("eine Kerze");
    });

    it("reads the firing choices back in one composed line (AC 4)", () => {
        render(null);

        setSelect(select("bot-create-firing-policy"), "multi");
        setInput(input("bot-create-maxPositions"), "2");

        const readback = host.querySelector('[data-testid="firing-readback"]');
        expect(readback?.textContent).toContain(
            String(lookup(en, "settings.automation.editor.policyMulti")),
        );
        expect(readback?.textContent).toContain(
            String(lookup(en, "settings.automation.editor.readbackPositions")).replaceAll(
                "{count}",
                "2",
            ),
        );
    });

    it("hands every firing field to the created draft", () => {
        render(null);
        setInput(input("bot-create-symbol"), "ETHUSDT");
        setInput(input("bot-create-entry-value"), "3000");
        setInput(input("bot-create-stop-distance"), "2");

        setSelect(select("bot-create-firing-policy"), "multi");
        setInput(input("bot-create-maxPositions"), "2");
        setInput(input("bot-create-maxEntriesPerDay"), "3");
        setInput(input("bot-create-maxRiskPerPosition"), "100");
        setInput(input("bot-create-budgetCap"), "500");
        setSelect(select("bot-create-entry-trigger"), "confirmation");

        save();

        const fields = mocks.createBotDraft.mock.calls[0][0] as Record<string, unknown>;
        expect(fields.firing_policy).toBe("multi");
        expect(fields.max_positions).toBe(2);
        expect(fields.max_entries_per_day).toBe(3);
        expect(fields.max_risk_per_position).toBe("100");
        expect(fields.budget_cap).toBe("500");
        expect(fields.entry_trigger).toBe("confirmation");
    });
});

describe("edit mode — the absorbed discipline", () => {
    it("refuses the save when the bot vanished from the store", () => {
        mocks.readRuleStore.mockReturnValue([]);
        render(storedBot());

        save();

        expect(mocks.validate).not.toHaveBeenCalled();
        expect(refusalText()).toBe(lookup(en, "settings.automation.botChanged"));
    });

    it("anchors a size refusal to the size field", () => {
        render(storedBot());

        const refusal = Object.assign(new Error("refused"), {
            name: "RuleRefusedError",
            refusals: [
                {
                    field: "action.order.size",
                    i18n_key: "rules.refusal.sizeMustBePositive",
                    translationKey: "rules.refusal.sizeMustBePositive",
                },
            ],
            translationKey: "rules.refusal.sizeMustBePositive",
        });
        mocks.validate.mockImplementationOnce(() => {
            throw refusal;
        });

        save();

        expect(input("bot-edit-size-bot-1").getAttribute("aria-invalid")).toBe("true");
        expect(
            input("bot-edit-size-bot-1").getAttribute("aria-describedby"),
        ).toBe("bot-edit-refusal-size");
        expect(host.querySelector("#bot-edit-refusal-size")).not.toBeNull();
    });
});

/**
 * The limits are counts, so the editor converts them with `Number()`. That
 * conversion is total where the trader's typing is not: `Number("abc")` is
 * `NaN`, `JSON.stringify` writes `NaN` as `null`, and the core reads `null`
 * for an `Option<u32>` as *absent* — which for `max_entries_per_day` means
 * "unbounded by day", the loosest setting there is.
 *
 * Proven against the real core (`createBotDraft` with `Number("abc")`): the
 * saved document carries no `max_entries_per_day` key at all and nothing is
 * refused. So the limit must be caught here, at the form, where the field
 * that earned the refusal is still on screen.
 */
describe("the limits refuse what is not a whole number (FEAT-0811)", () => {
    function fillCreateMinimum(): void {
        setInput(input("bot-create-symbol"), "ETHUSDT");
        setInput(input("bot-create-entry-value"), "3000");
        setInput(input("bot-create-stop-distance"), "2");
    }

    it("refuses a non-numeric entries-per-day instead of dropping the limit", () => {
        render(null);
        fillCreateMinimum();

        setInput(input("bot-create-maxEntriesPerDay"), "abc");
        save();

        expect(mocks.createBotDraft).not.toHaveBeenCalled();
        expect(input("bot-create-maxEntriesPerDay").getAttribute("aria-invalid")).toBe("true");
        expect(refusalText()).toBe(lookup(en, "settings.automation.editor.countWholeNumber"));
    });

    it("refuses a fractional position count, which the core would reject unanchored", () => {
        render(null);
        fillCreateMinimum();

        setInput(input("bot-create-maxPositions"), "2.5");
        save();

        expect(mocks.createBotDraft).not.toHaveBeenCalled();
        expect(input("bot-create-maxPositions").getAttribute("aria-invalid")).toBe("true");
    });

    it("still accepts a whole number", () => {
        render(null);
        fillCreateMinimum();

        setInput(input("bot-create-maxEntriesPerDay"), "3");
        save();

        expect(mocks.createBotDraft).toHaveBeenCalledTimes(1);
        expect(mocks.createBotDraft.mock.calls[0][0].max_entries_per_day).toBe(3);
    });
});

/**
 * An empty constant is refused by the core — but with `field: ""`, so
 * `anchorFor` cannot place it and the trader reads a generic message with no
 * input highlighted. Verified against the real core: the refusal is
 * `rules.refusal.unknownField` with an empty field. The form owns this one,
 * exactly as it already owns the empty symbol and the empty stop.
 */
describe("the entry value is answered before the core sees it (FEAT-0811)", () => {
    it("refuses an empty entry value anchored to the field", () => {
        render(null);
        setInput(input("bot-create-symbol"), "ETHUSDT");
        setInput(input("bot-create-stop-distance"), "2");

        save();

        expect(mocks.createBotDraft).not.toHaveBeenCalled();
        expect(input("bot-create-entry-value").getAttribute("aria-invalid")).toBe("true");
        expect(refusalText()).toBe(lookup(en, "settings.automation.editor.valueRequired"));
    });
});
