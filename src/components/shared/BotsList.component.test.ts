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
import { paperExchange, setPaperPriceFeed } from "../../services/paperExchange";
import { recordBotEntry } from "../../services/alertEngine/ruleStateStore";
import { recordBotGuard } from "../../services/alertEngine/botGuardStore";

const closeBotOwnedPositionsMock = vi.hoisted(() =>
    vi.fn().mockResolvedValue({ closed: 0, refused: [] as string[] }),
);
vi.mock("../../stores/alerts.svelte", async (importOriginal) => {
    const actual =
        await importOriginal<typeof import("../../stores/alerts.svelte")>();
    return {
        ...actual,
        // The kill switch's close lane would otherwise dynamically import the
        // whole tradeService stack into this harness. What the row owes the
        // trader — the entries stop, the close is *asked* for — is pinned
        // here; the lane itself is pinned end to end against the real
        // tradeService in botExitExecution.integration.test.ts.
        closeBotOwnedPositions: closeBotOwnedPositionsMock,
    };
});

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
    // FEAT-0823 — same reset for the awaiting report: it is $state on the
    // singleton, and a leftover wait would shadow every later case's chip.
    alertState.awaitingReport = [];
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

    it("renders a localized blocked line, never the loop's raw reason", () => {
        seedBots(botDocument("bot-1"));
        render();

        alertState.unevaluableReport = [
            {
                ruleId: "bot-1",
                name: "bot bot-1",
                symbol: "BTCUSDT",
                reason: "the rule core refuses this rule: action.order.size must be positive",
            },
        ];
        flushSync();

        const row = rowOf("bot-1");
        expect(chipOf(row)).toBe(lookup(en, "botsList.state.blocked"));
        const line = row!.querySelector<HTMLElement>('[data-testid="bot-blocked-reason"]');
        expect(line).not.toBeNull();
        // The loop's reasons are developer-facing English, some of them
        // parameterized (`${indicator.id} has no output '${output}'`), so the
        // row renders one localized sentence; the raw string belongs to the
        // loop's log, not to a surface in any locale.
        expect(line!.textContent?.trim()).toBe(lookup(en, "botsList.blockedReason"));
        expect(line!.textContent).not.toContain("refuses");
        expect(line!.textContent).not.toContain("size");
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

    it("pins the opener's ownership join: the second bot on the slot stays armed", async () => {
        // Not a collision yet — the second bot never fires here. The true
        // collision (a second bot refused the taken slot) is FEAT-0810's to
        // build; this case pins the join that refusal will read: the index
        // names the opener (FEAT-0806/0807), so the opener renders linked and
        // the second bot renders armed with no link — exactly that truth.
        seedBots(botDocument("bot-1"), botDocument("bot-2"));
        await openAs("bot-1");
        render({ onshowposition: vi.fn() });

        const owner = rowOf("bot-1");
        const second = rowOf("bot-2");
        expect(chipOf(owner)).toBe(lookup(en, "botsList.state.in_position"));
        expect(owner!.querySelector('[data-testid="bot-view-position"]')).not.toBeNull();
        expect(chipOf(second)).toBe(lookup(en, "botsList.state.armed"));
        expect(second!.querySelector('[data-testid="bot-view-position"]')).toBeNull();
    });

    it("keeps veto and intrabar bots distinguishable in the condition clause", () => {
        // Veto and evaluation mode are both inside the content hash: two
        // bots differing only in either are two different strategies, and
        // byte-identical condition lines would say they are the same one.
        const plain = botDocument("bot-plain");
        const vetoed = botDocument("bot-veto", {
            veto: { kind: "position", side: "long", open: true },
        });
        const intrabar = botDocument("bot-intrabar", { evaluation_mode: "intrabar" });
        seedBots(plain, vetoed, intrabar);
        render();

        const clause = (id: string) =>
            rowOf(id)!.querySelector('[data-testid="bot-condition"]')?.textContent?.trim() ?? "";
        expect(clause("bot-veto")).not.toBe(clause("bot-plain"));
        expect(clause("bot-veto")).toContain("unless");
        expect(clause("bot-intrabar")).not.toBe(clause("bot-plain"));
        expect(clause("bot-intrabar")).toContain("forming");
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

    it("names the bot in every row control's accessible name", async () => {
        seedBots(botDocument("bot-1"), botDocument("bot-2"));
        await openAs("bot-1");
        render({ onshowposition: vi.fn() });

        // Identical visible labels are fine for a sighted trader scanning
        // rows; a screen reader reads the label alone, so the accessible name
        // must say which bot the control acts on.
        const first = rowOf("bot-1")!;
        const second = rowOf("bot-2")!;
        expect(
            first.querySelector('[data-testid="bot-pause-toggle"]')?.getAttribute("aria-label"),
        ).toBe(lookup(en, "botsList.pauseNamed").replace("{name}", "bot bot-1"));
        expect(
            second.querySelector('[data-testid="bot-pause-toggle"]')?.getAttribute("aria-label"),
        ).toBe(lookup(en, "botsList.pauseNamed").replace("{name}", "bot bot-2"));
        expect(
            first.querySelector('[data-testid="bot-view-position"]')?.getAttribute("aria-label"),
        ).toBe(lookup(en, "botsList.viewPositionNamed").replace("{name}", "bot bot-1"));
    });

    it("labels the trigger timeframe on the condition line, not the order", () => {
        seedBots(botDocument("bot-1"));
        render();

        // `1h` sitting unlabeled at the end of the order sentence reads as
        // the order's timeframe; it qualifies the condition, so it moves to
        // the condition line and gains a visible label — a title alone stays
        // invisible to a screen reader and to a scan.
        const conditionLine = rowOf("bot-1")!.querySelector<HTMLElement>(
            '[data-testid="bot-condition"]',
        )!;
        const chip = conditionLine.querySelector<HTMLElement>('[data-testid="bot-timeframe"]');
        expect(chip).not.toBeNull();
        expect(chip!.textContent?.trim()).toBe(`${lookup(en, "botsList.timeframe")} 1h`);
        const orderLine = rowOf("bot-1")!.querySelector<HTMLElement>('[data-testid="bot-order"]');
        expect(orderLine).not.toBeNull();
        expect(orderLine!.querySelector('[data-testid="bot-timeframe"]')).toBeNull();
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
        // Exact literals, not a non-empty check: `.not.toBe("")` passes for
        // undefined, which is exactly the drift this case exists to catch.
        expect(lookup(de, "dashboard.bots")).toBe("Bots");
        expect(lookup(de, "botsList.state.armed")).toBe("Scharf");
        expect(lookup(de, "botsList.state.submitting")).toBe("Wird gesendet");
        expect(lookup(de, "botsList.state.in_position")).toBe("Position offen");
        expect(lookup(de, "botsList.state.closing")).toBe("Schließt");
        expect(lookup(de, "botsList.state.closed")).toBe("Abgeschlossen");
        expect(lookup(de, "botsList.state.paused")).toBe("Pausiert");
        expect(lookup(de, "botsList.state.blocked")).toBe("Blockiert");
        expect(lookup(de, "botsList.state.expired")).toBe("Abgelaufen");
        expect(lookup(de, "botsList.lingeringTitle")).toBe("Position eines gelöschten Bots");
        expect(lookup(de, "botsList.pausedWithPosition")).toBe("Pausiert, Position offen");
        expect(lookup(de, "botsList.blockedReason")).toBe(
            "Lässt sich gerade nicht auswerten und löst daher nicht aus.",
        );
        expect(lookup(de, "positionsList.botOwnerHintName")).toBe(
            "Diese Position wurde vom Bot „{name}“ eröffnet. Der Klick wechselt zum Tab „Bots“.",
        );
        // The aria-label templates the row controls render from, with the
        // same placeholder in both locales.
        for (const key of ["botsList.pauseNamed", "botsList.resumeNamed", "botsList.viewPositionNamed"] as const) {
            const enTemplate = lookup(en, key);
            const deTemplate = lookup(de, key);
            expect(typeof deTemplate).toBe("string");
            expect(deTemplate).toContain("{name}");
            expect(enTemplate).toContain("{name}");
        }
    });
});

describe("the projection's clock", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("ticks once immediately on mount, not a full period later", () => {
        vi.useFakeTimers();
        seedBots(botDocument("bot-1"));
        // Stale from whatever surface ticked it last — mount is exactly the
        // moment that answer goes stale.
        botsState.now = 1_000;
        render();

        // No timer advance happens here: the tick the surface owns is the
        // first action of mounting it, so `expired` can turn on mount rather
        // than a period afterwards.
        expect(botsState.now).toBe(Date.now());
    });

    it("keeps ticking on the interval while mounted", () => {
        vi.useFakeTimers();
        seedBots(botDocument("bot-1"));
        render();
        const atMount = botsState.now;

        vi.advanceTimersByTime(30_000);

        // The interval is the point of the effect: without it every case in
        // the file above stays green while `expired` never turns and holding
        // times never advance.
        expect(botsState.now).toBe(atMount + 30_000);
        expect(botsState.now).toBe(Date.now());
    });
});

describe("FEAT-0822 — firing limits and the kill switch", () => {
    it("reads limit_reached for a multi bot whose day cap is spent", () => {
        seedBots(
            botDocument("bot-1", { firing_policy: "multi", max_entries_per_day: 1 }),
        );

        // The counter is the projection's input, not a rule rewrite: nothing
        // but a version bump tells it to re-read the entry ledger.
        recordBotEntry("bot-1");
        alertState.firingsVersion += 1;
        render();

        expect(chipOf(rowOf("bot-1"))).toBe(lookup(en, "botsList.state.limit_reached"));
    });

    it("a bot with budget left by other limits still reads by its state", () => {
        // The complement of the row above: the same spent ledger under a bot
        // with no caps set stays a plain state — limit_reached is a property
        // of the document's own limits, never of global activity.
        seedBots(botDocument("bot-1"));
        recordBotEntry("bot-1");
        alertState.firingsVersion += 1;
        render();

        expect(chipOf(rowOf("bot-1"))).toBe(lookup(en, "botsList.state.armed"));
    });

    it("stop asks before closing an owned position, and closes it on confirm", async () => {
        seedBots(botDocument("bot-1"));
        await openAs("bot-1");
        render();

        const row = rowOf("bot-1");
        expect(chipOf(row)).toBe(lookup(en, "botsList.state.in_position"));

        row!.querySelector<HTMLElement>('[data-testid="bot-kill"]')!.click();
        flushSync();

        // Entries stop the moment Stop is pressed, before any close is
        // asked for — the two halves of the kill are deliberately separate.
        expect(setBotEnabledMock).toHaveBeenLastCalledWith("bot-1", false);
        expect(chipOf(rowOf("bot-1"))).toBe(lookup(en, "botsList.state.paused"));

        const confirm = host.querySelector<HTMLElement>('[data-testid="bot-kill-confirm"]');
        expect(confirm).not.toBeNull();
        // The ask names the market the owned position is on, so the trader
        // confirms the exact close, not a category of closes.
        expect(confirm?.textContent).toContain("BTCUSDT");

        host.querySelector<HTMLElement>('[data-testid="bot-kill-confirm-close"]')!.click();
        await vi.waitFor(() => expect(closeBotOwnedPositionsMock).toHaveBeenCalledWith("bot-1"));
        flushSync();
        expect(host.querySelector('[data-testid="bot-kill-confirm"]')).toBeNull();
    });

    it("keep-it-open cancels the close and leaves the position owned", async () => {
        seedBots(botDocument("bot-1"));
        await openAs("bot-1");
        render();

        rowOf("bot-1")!.querySelector<HTMLElement>('[data-testid="bot-kill"]')!.click();
        flushSync();

        host.querySelector<HTMLElement>('[data-testid="bot-kill-confirm-keep"]')!.click();
        flushSync();

        expect(closeBotOwnedPositionsMock).not.toHaveBeenCalled();
        expect(host.querySelector('[data-testid="bot-kill-confirm"]')).toBeNull();
        // Entries stay stopped (the trader pressed Stop), the book keeps the
        // row they chose to keep.
        expect(chipOf(rowOf("bot-1"))).toBe(lookup(en, "botsList.state.paused"));
        expect(paperState.positions).toHaveLength(1);
    });

    it("a bot that owns nothing stops without asking", () => {
        seedBots(botDocument("bot-1"));
        render();

        rowOf("bot-1")!.querySelector<HTMLElement>('[data-testid="bot-kill"]')!.click();
        flushSync();

        expect(setBotEnabledMock).toHaveBeenLastCalledWith("bot-1", false);
        // No position, no confirm block: stopping entries is the whole act.
        expect(host.querySelector('[data-testid="bot-kill-confirm"]')).toBeNull();
        expect(chipOf(rowOf("bot-1"))).toBe(lookup(en, "botsList.state.paused"));
    });

    it("shows the latest guard with its repeat count", () => {
        seedBots(botDocument("bot-1"));
        render();
        expect(host.querySelector('[data-testid="bot-guard-line"]')).toBeNull();

        // Two refusals of the same reason land as one row that counts them.
        recordBotGuard("bot-1", "slot-reserved", 0);
        recordBotGuard("bot-1", "slot-reserved", 60_000);
        alertState.guardsVersion += 1;
        flushSync();

        const line = host.querySelector<HTMLElement>('[data-testid="bot-guard-line"]');
        expect(line?.textContent?.trim()).toBe(
            `Last guard: ${lookup(en, "botsList.guard.slotReserved")} ×2`,
        );
    });

    it("shows awaiting confirmation while a signal waits for its candle", () => {
        seedBots(botDocument("bot-1", { entry_trigger: "confirmation" }));

        // The loop's per-close report is the whole input: the chip follows
        // it without any ledger version bump.
        alertState.awaitingReport = [{ ruleId: "bot-1", signalAnchorMs: 60_000 }];
        flushSync();

        render();
        expect(chipOf(rowOf("bot-1"))).toBe(lookup(en, "botsList.state.awaitingConfirmation"));
    });

    it("renders the confirmation discards in the row's guard line", () => {
        seedBots(botDocument("bot-1", { entry_trigger: "confirmation" }));
        render();

        // A signal the market refused: the guard line says it in the
        // trader's words, counted while it repeats.
        recordBotGuard("bot-1", "confirmation-against-direction", 60_000);
        alertState.guardsVersion += 1;
        flushSync();

        const line = host.querySelector<HTMLElement>('[data-testid="bot-guard-line"]');
        expect(line?.textContent?.trim()).toBe(
            `Last guard: ${lookup(en, "botsList.guard.confirmationAgainstDirection")} ×1`,
        );
    });
});
