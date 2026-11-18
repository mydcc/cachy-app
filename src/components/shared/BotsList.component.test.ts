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

/*
 * FEAT-0808 — the bots tab of the positions sidebar.
 *
 * Against the real projection (botsState) and the real simulated book, the
 * way `botsState.reactivityContract.component.test.ts` drives them: a
 * surface that mounts over a projection is only honest under the same
 * subscription the app runs it under, and every case below is an
 * acceptance case from the item — including the lingering row, which is
 * behaviour, not an edge to hide.
 *
 * `setBotEnabled` is the one mock: it is the only write, its real
 * implementation needs the WASM core, and what it must preserve (only
 * `enabled` moves, the store keeps the row) is pinned against the real
 * core in `botStore.integration.test.ts`. Here the mock writes the same
 * field to the same storage key, so the re-render and the reload claim are
 * still exercised end to end.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";

vi.mock("$app/env", () => ({ browser: true, dev: false }));

import { Decimal } from "decimal.js";

import type { RuleDocument } from "../../lib/rules/types";
import { CONSTANTS } from "../../lib/constants";
import { RULES_STORAGE_KEY } from "../../services/alertEngine/migrateAlertsToRules";
import { recordRuleFiring } from "../../services/alertEngine/ruleStateStore";
import { paperExchange, setPaperPriceFeed } from "../../services/paperExchange";

const setBotEnabledMock = vi.hoisted(() => vi.fn());
vi.mock("../../services/alertEngine/botStore", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../services/alertEngine/botStore")>();
    return {
        ...actual,
        // The same write the real one makes, without the core: flip `enabled`
        // on the stored document and persist, so the re-render after the
        // version bump reads back what the trader will read after a reload.
        setBotEnabled: setBotEnabledMock.mockImplementation(
            (botId: string, enabled: boolean) => {
                const stored = JSON.parse(
                    localStorage.getItem(RULES_STORAGE_KEY) ?? "[]",
                ) as RuleDocument[];
                const updated = stored.map((rule) =>
                    rule.id === botId ? { ...rule, enabled } : rule,
                );
                localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(updated));
                return updated.find((rule) => rule.id === botId);
            },
        ),
    };
});

import en from "../../locales/locales/en.json";
import de from "../../locales/locales/de.json";

function lookup(bundle: Record<string, unknown>, key: string): string {
    return key
        .split(".")
        .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], bundle) as string;
}

vi.mock("../../locales/i18n", async () => {
    const { readable } = await import("svelte/store");
    const translate = (key: string, options?: { values?: Record<string, unknown> }) => {
        const template = lookup(en, key) ?? key;
        return Object.entries(options?.values ?? {}).reduce(
            (text, [name, replacement]) => text.replaceAll(`{${name}}`, String(replacement)),
            template,
        );
    };
    return { _: readable(translate), locale: readable("en"), setLocale: vi.fn() };
});

import BotsList from "./BotsList.svelte";
import { alertState } from "../../stores/alerts.svelte";
import { botsState } from "../../stores/botsState.svelte";
import { paperState } from "../../stores/paperTrading.svelte";

const HASH = "ab".repeat(32);

function botDocument(id: string, overrides: Partial<RuleDocument> = {}): RuleDocument {
    return {
        schema_version: 2,
        id,
        name: `bot ${id}`,
        symbol: "BTCUSDT",
        trigger_timeframe: "1h",
        conditions: {
            kind: "compare",
            left: { kind: "price", field: "close" },
            op: "gte",
            right: { kind: "constant", value: "50000" },
            timeframe: "1h",
        },
        action: { consequence_level: "simulate", order: { side: "buy", size_basis: "percent_of_equity", size: "1" } },
        enabled: true,
        provenance: { source: "human", created_at_ms: 1_700_000_000_000 },
        ...overrides,
    };
}

function seedBots(...documents: RuleDocument[]): void {
    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(documents));
    alertState.rulesVersion += 1;
}

/** A bot-stamped market entry into the simulated book (FEAT-0806's stamp). */
async function openAs(botId: string): Promise<void> {
    await paperExchange.handle("/api/orders", {
        type: "place-order",
        symbol: "BTCUSDT",
        side: "BUY",
        orderType: "MARKET",
        qty: "0.02",
        origin: "bot",
        botId,
        ruleId: botId,
        strategyHash: HASH,
    });
}

let host: HTMLElement;
let component: ReturnType<typeof mount> | null = null;

function render(props: { onshowposition?: (positionId: string) => void } = {}) {
    component = mount(BotsList, { target: host, props: props });
    flushSync();
    return component;
}

function rowOf(botId: string): HTMLElement | null {
    return host.querySelector<HTMLElement>(`[data-testid="bot-row-${botId}"]`);
}

function chipOf(row: HTMLElement | null): string {
    return row?.querySelector<HTMLElement>('[data-testid="bot-state-chip"]')?.textContent?.trim() ?? "";
}

/** The list preserves row order, so first-child position is the sort answer. */
function botRowOrder(): string[] {
    return [...host.querySelectorAll("li[data-bot-id]")].map((li) => li.getAttribute("data-bot-id") ?? "");
}

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    paperState.reloadFromStorage();
    paperState.resetBook();
    paperState.setConfig("failureMode", "none");
    paperState.setConfig("slippageBps", "0");
    paperState.setConfig("takerFeeBps", "0");
    paperState.setConfig("startingBalance", "10000");
    paperState.resetBook();
    paperState.setEnabled(true);
    setPaperPriceFeed(() => new Decimal(50000));

    alertState.unevaluableReport = [];
    botsState.setSubmitting(new Set());
    botsState.now = Date.now();

    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component);
    component = null;
    host.remove();
});

describe("FEAT-0808 — the bots tab", () => {
    it("lists a bot that has never fired, with its state and symbol", () => {
        seedBots(botDocument("bot-1"));
        render();

        const row = rowOf("bot-1");
        expect(row, "the waiting bot has no row").not.toBeNull();
        expect(row!.textContent).toContain("bot bot-1");
        expect(row!.textContent).toContain("BTCUSDT");
        expect(chipOf(row)).toBe(lookup(en, "botsList.state.armed"));
        // The condition sentence is the one the trader armed from.
        expect(row!.textContent).toContain("50000");
        expect(row!.textContent).toContain(lookup(en, "botsList.firedNever"));
        expect(row!.textContent).toContain(lookup(en, "botsList.created").split(" {")[0]);
    });

    it("renders an in-position bot with the position's facts and no PnL of its own", async () => {
        seedBots(botDocument("bot-1"));
        await openAs("bot-1");
        const onshowposition = vi.fn();
        render({ onshowposition });

        const row = rowOf("bot-1");
        expect(chipOf(row)).toBe(lookup(en, "botsList.state.in_position"));
        // Facts from the book, not from the Positions tab: the entry and the
        // holding time. The money stays on the position row.
        const facts = row!.querySelector<HTMLElement>('[data-testid="bot-position-facts"]');
        expect(facts).not.toBeNull();
        expect(facts!.textContent).toContain("50000");
        expect(facts!.textContent).toContain(lookup(en, "botsList.holding").split(" {")[0]);
        expect(row!.textContent).not.toMatch(/PnL/i);

        const link = row!.querySelector<HTMLButtonElement>('[data-testid="bot-view-position"]');
        expect(link).not.toBeNull();
        link!.click();
        flushSync();
        const positionId = paperState.positions[0]?.positionId;
        expect(onshowposition).toHaveBeenCalledWith(positionId);
    });

    it("keeps the position's facts when no Positions tab links back (paper mode off)", async () => {
        seedBots(botDocument("bot-1"));
        await openAs("bot-1");
        render();

        const row = rowOf("bot-1");
        expect(chipOf(row)).toBe(lookup(en, "botsList.state.in_position"));
        expect(row!.querySelector('[data-testid="bot-position-facts"]')).not.toBeNull();
        // A dead link is how a surface learns to be ignored; the callback's
        // absence must remove the button, not break the row.
        expect(row!.querySelector('[data-testid="bot-view-position"]')).toBeNull();
    });

    it("shows a paused bot with an open position as paused, not flat", async () => {
        seedBots(botDocument("bot-1", { enabled: false }));
        await openAs("bot-1");
        render();

        const row = rowOf("bot-1");
        expect(chipOf(row)).toBe(lookup(en, "botsList.state.paused"));
        expect(
            row!.querySelector('[data-testid="bot-paused-with-position"]')?.textContent?.trim(),
        ).toBe(lookup(en, "botsList.pausedWithPosition"));
    });

    it("explains a blocked bot with the loop's own reason", () => {
        seedBots(botDocument("bot-1"));
        render();

        alertState.unevaluableReport = [
            { ruleId: "bot-1", name: "bot bot-1", symbol: "BTCUSDT", reason: "warmup" },
        ];
        flushSync();

        const row = rowOf("bot-1");
        expect(chipOf(row)).toBe(lookup(en, "botsList.state.blocked"));
        expect(
            row!.querySelector('[data-testid="bot-blocked-reason"]')?.textContent?.trim(),
        ).toBe(lookup(en, "botsList.blockedReason").replace("{reason}", "warmup"));
    });

    it("turns a past-deadline, never-fired bot to expired", () => {
        seedBots(botDocument("bot-1", { valid_until_ms: 1 }));
        render();

        expect(chipOf(rowOf("bot-1"))).toBe(lookup(en, "botsList.state.expired"));
    });

    it("shows the empty state when no bot exists", () => {
        render();

        expect(host.querySelector('[data-testid="bots-empty"]')?.textContent?.trim()).toBe(
            lookup(en, "botsList.empty"),
        );
        expect(host.querySelectorAll("li")).toHaveLength(0);
    });

    it("renders a refusal, and nothing else, while the rule store cannot be read", () => {
        localStorage.setItem(RULES_STORAGE_KEY, "{not json");
        alertState.rulesVersion += 1;
        render();

        expect(host.querySelector('[data-testid="bots-rules-refusal"]')?.textContent?.trim()).toBe(
            lookup(en, "botsList.rulesUnreadable"),
        );
        expect(host.querySelectorAll("li")).toHaveLength(0);
    });

    it("degrades every bot to blocked with a notice while the book cannot be read", async () => {
        seedBots(botDocument("bot-1"));
        await openAs("bot-1");

        localStorage.setItem(CONSTANTS.LOCAL_STORAGE_PAPER_KEY, "{not json");
        paperState.reloadFromStorage();
        render();

        expect(host.querySelector('[data-testid="bots-book-degraded"]')).not.toBeNull();
        expect(chipOf(rowOf("bot-1"))).toBe(lookup(en, "botsList.state.blocked"));
    });

    it("renders the row of a position whose bot was deleted", async () => {
        const onshowposition = vi.fn();
        seedBots(botDocument("bot-1"));
        await openAs("bot-1");
        render({ onshowposition });
        expect(rowOf("bot-1")).not.toBeNull();

        // The rule goes; the position and its slot stay (FEAT-0807).
        seedBots();
        flushSync();

        expect(rowOf("bot-1")).toBeNull();
        const positionId = paperState.positions[0]?.positionId;
        const lingering = host.querySelector<HTMLElement>(
            `[data-testid="bot-row-lingering-${positionId}"]`,
        );
        expect(lingering, "the lingering position lost its row").not.toBeNull();
        expect(lingering!.textContent).toContain(lookup(en, "botsList.lingeringTitle"));
        expect(lingering!.textContent).toContain("BTCUSDT");

        const link = lingering!.querySelector<HTMLButtonElement>('[data-testid="bot-view-position"]');
        expect(link).not.toBeNull();
        link!.click();
        flushSync();
        expect(onshowposition).toHaveBeenCalledWith(positionId);
    });

    it("keeps the second bot on a taken slot armed, with the opener linked", async () => {
        seedBots(botDocument("bot-1"), botDocument("bot-2"));
        await openAs("bot-1");
        render({ onshowposition: vi.fn() });

        const owner = rowOf("bot-1");
        const second = rowOf("bot-2");
        expect(chipOf(owner)).toBe(lookup(en, "botsList.state.in_position"));
        expect(owner!.querySelector('[data-testid="bot-view-position"]')).not.toBeNull();
        // The index names the opener (FEAT-0806/0807); the second bot has no
        // owned row and stays armed — exactly that truth, nothing kinder.
        expect(chipOf(second)).toBe(lookup(en, "botsList.state.armed"));
        expect(second!.querySelector('[data-testid="bot-view-position"]')).toBeNull();
    });

    it("sorts by state first, then by symbol", async () => {
        seedBots(botDocument("alpha-armed"), botDocument("zeta-owns"));
        await openAs("zeta-owns");
        render();

        // "alpha" sorts first by name; the state order puts the active bot
        // above the waiting one, which is the spec's proposal, pinned.
        expect(botRowOrder()).toEqual(["zeta-owns", "alpha-armed"]);
    });

    it("pauses and resumes through the store's only write", async () => {
        seedBots(botDocument("bot-1"));
        render();

        const stored = () =>
            JSON.parse(localStorage.getItem(RULES_STORAGE_KEY) ?? "[]") as RuleDocument[];

        const toggle = rowOf("bot-1")!.querySelector<HTMLButtonElement>(
            '[data-testid="bot-pause-toggle"]',
        );
        expect(toggle!.textContent?.trim()).toBe(lookup(en, "botsList.pause"));

        const before = stored()[0];
        toggle!.click();
        flushSync();

        expect(setBotEnabledMock).toHaveBeenCalledWith("bot-1", false);
        // The write persists in the store a reload reads — and nothing but
        // `enabled` moved, which is the item's "writes only enabled".
        expect(stored()[0].enabled).toBe(false);
        expect({ ...stored()[0], enabled: undefined }).toEqual({ ...before, enabled: undefined });
        expect(rowOf("bot-1")!.textContent).toContain(lookup(en, "botsList.state.paused"));

        const resume = rowOf("bot-1")!.querySelector<HTMLButtonElement>(
            '[data-testid="bot-pause-toggle"]',
        );
        expect(resume!.textContent?.trim()).toBe(lookup(en, "botsList.resume"));
        resume!.click();
        flushSync();
        expect(stored()[0].enabled).toBe(true);
        expect(chipOf(rowOf("bot-1"))).toBe(lookup(en, "botsList.state.armed"));
    });

    it("keeps every control a named, native button", () => {
        seedBots(botDocument("bot-1"));
        render();

        const buttons = [...host.querySelectorAll("button")];
        expect(buttons.length).toBeGreaterThan(0);
        for (const button of buttons) {
            // Native buttons are keyboard-reachable by construction; the
            // accessible name is the text content. Both are load-bearing for
            // the tab's a11y criterion, so both are asserted, not assumed.
            expect(button.tagName).toBe("BUTTON");
            expect((button.textContent ?? "").trim()).not.toBe("");
        }
    });

    it("keeps the new strings available in German", () => {
        expect(lookup(de, "dashboard.bots")).not.toBe("");
        for (const state of [
            "armed",
            "submitting",
            "in_position",
            "closing",
            "closed",
            "paused",
            "blocked",
            "expired",
        ] as const) {
            expect(lookup(de, `botsList.state.${state}`)).not.toBe("");
        }
        expect(lookup(de, "botsList.lingeringTitle")).not.toBe("");
        expect(lookup(de, "botsList.pausedWithPosition")).not.toBe("");
        expect(lookup(de, "positionsList.botOwnerHintName")).not.toBe("");
    });
});
