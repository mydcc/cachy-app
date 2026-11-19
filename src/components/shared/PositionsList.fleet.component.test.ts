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
 * FEAT-0824 — the positions list as a fleet view: ten positions across five
 * symbols and three bots (plus manual ones), exact aggregates, sort / filter
 * that never drop or double a row, and a keyboard path through N=24 rows.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import { Decimal } from "decimal.js";
import en from "../../locales/locales/en.json";
import type { OMSPosition } from "../../services/omsTypes";
import { formatDynamicDecimal } from "../../utils/utils";

const settings = vi.hoisted(() => ({
    positionViewMode: "detailed" as "detailed" | "focus",
    pnlViewMode: "value" as "value" | "percent" | "bar",
}));
vi.mock("../../stores/settings.svelte", () => ({ settingsState: settings }));

// Plans by symbol; a symbol absent from the table has no plan cached.
const plans = vi.hoisted(() => ({
    table: {} as Record<string, { profit?: { triggerPrice: string }; loss?: { triggerPrice: string } }>,
}));
vi.mock("../../stores/tpsl.svelte", () => ({
    tpSlState: {
        hasPlansFor: (symbol: string) => symbol in plans.table,
        plansFor: (symbol: string) => plans.table[symbol] ?? {},
    },
}));

function lookup(key: string): string {
    return key
        .split(".")
        .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], en) as string;
}

vi.mock("../../locales/i18n", async () => {
    const { readable: r } = await import("svelte/store");
    return {
        _: r((key: string, options?: { values?: Record<string, unknown> }) => {
            const template = lookup(key) ?? key;
            if (!options?.values) return template;
            return Object.entries(options.values).reduce(
                (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
                template,
            );
        }),
        locale: r("en"),
        setLocale: vi.fn(),
    };
});

import PositionsList from "./PositionsList.svelte";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    plans.table = {};
    settings.positionViewMode = "detailed";
    settings.pnlViewMode = "value";
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component);
    component = null;
    host.remove();
});

function render(props: Record<string, unknown>) {
    if (component) unmount(component);
    host.innerHTML = "";
    component = mount(PositionsList, { target: host, props }) as never;
    flushSync();
}

function position(
    id: string,
    symbol: string,
    pnl: string,
    over: Partial<OMSPosition> = {},
): OMSPosition {
    return {
        positionId: id,
        symbol,
        side: "long",
        amount: new Decimal("2"),
        entryPrice: new Decimal("100"),
        markPrice: new Decimal("110"),
        unrealizedPnl: new Decimal(pnl),
        leverage: new Decimal("5"),
        marginMode: "cross",
        openedAt: 1_000,
        ...over,
    };
}

const BOTS = new Map([
    ["rsi-1", { botId: "bot-rsi", name: "RSI 15m" }],
    ["rsi-2", { botId: "bot-rsi", name: "RSI 15m" }],
    ["rsi-3", { botId: "bot-rsi", name: "RSI 15m" }],
    ["wk-1", { botId: "bot-weekly", name: "Weekly trend" }],
    ["wk-2", { botId: "bot-weekly", name: "Weekly trend" }],
    ["wk-3", { botId: "bot-weekly", name: "Weekly trend" }],
    ["brk-1", { botId: "bot-break", name: "Breakout" }],
    ["brk-2", { botId: "bot-break", name: "Breakout" }],
]);

/** Ten positions, five symbols, three bots, two of the ten manual. */
function tenPositions(): OMSPosition[] {
    return [
        position("rsi-1", "BTCUSDT", "0.1", { openedAt: 500 }),
        position("rsi-2", "ETHUSDT", "0.2", { openedAt: 400 }),
        position("rsi-3", "SOLUSDT", "0.3", { openedAt: 300 }),
        position("wk-1", "BTCUSDT", "-0.05", { side: "short", openedAt: 200 }),
        position("wk-2", "ADAUSDT", "1", { openedAt: 100 }),
        position("wk-3", "XRPUSDT", "2"),
        position("brk-1", "SOLUSDT", "3", { side: "short" }),
        position("brk-2", "ADAUSDT", "-4", { side: "short" }),
        position("man-1", "ETHUSDT", "5", { side: "short" }),
        position("man-2", "XRPUSDT", "6", { side: "short" }),
    ];
}

const rows = () => Array.from(host.querySelectorAll<HTMLElement>("[data-fleet-row]"));
const rowIds = () => rows().map((r) => r.dataset.positionId);
const text = (testId: string) => host.querySelector(`[data-testid="${testId}"]`)?.textContent?.trim();

function choose(testId: string, value: string) {
    const select = host.querySelector<HTMLSelectElement>(`[data-testid="${testId}"]`)!;
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();
}

describe("FEAT-0824 — N positions, mixed ownership", () => {
    it("renders ten positions across five symbols and three bots, each with its owner and its stop/TP", () => {
        plans.table = {
            BTCUSDT: { profit: { triggerPrice: "130" }, loss: { triggerPrice: "95" } },
            ETHUSDT: { profit: { triggerPrice: "140" }, loss: { triggerPrice: "90" } },
        };
        render({ positions: tenPositions(), botOwners: BOTS, onshowbot: vi.fn() });

        expect(rows()).toHaveLength(10);
        expect(new Set(rowIds()).size).toBe(10);

        const owner = (id: string) =>
            host.querySelector(`[data-position-id="${id}"] [data-testid="bot-owner-badge"]`)?.textContent?.trim();
        expect(owner("rsi-1")).toBe("RSI 15m");
        expect(owner("wk-2")).toBe("Weekly trend");
        expect(owner("brk-2")).toBe("Breakout");
        expect(owner("man-1")).toBeUndefined();

        const btc = host.querySelector('[data-position-id="rsi-1"]')!.textContent!;
        expect(btc).toContain("TP 130");
        expect(btc).toContain("SL 95");
        const eth = host.querySelector('[data-position-id="man-1"]')!.textContent!;
        expect(eth).toContain("TP 140");
        expect(eth).toContain("SL 90");
    });

    it("tells a manual position apart without opening anything", () => {
        render({ positions: tenPositions(), botOwners: BOTS, onshowbot: vi.fn() });

        const manual = host.querySelector('[data-position-id="man-1"]')!;
        const bot = host.querySelector('[data-position-id="rsi-1"]')!;
        expect(manual.getAttribute("data-owner")).toBe("manual");
        expect(manual.querySelector('[data-testid="manual-badge"]')?.textContent?.trim()).toBe("Manual");
        expect(bot.getAttribute("data-owner")).toBe("bot");
        expect(bot.querySelector('[data-testid="manual-badge"]')).toBeNull();
    });

    it("adds no Manual badge when no bot owns anything — it would be noise on every row", () => {
        render({
            positions: [position("a", "BTCUSDT", "1"), position("b", "ETHUSDT", "2")],
            botOwners: new Map(),
            onshowbot: vi.fn(),
        });
        expect(host.querySelector('[data-testid="manual-badge"]')).toBeNull();
        expect(host.querySelector('[data-testid="fleet-filter"]')).toBeNull();
    });

    it("keeps the badge in the focus (panic) layout too", () => {
        settings.positionViewMode = "focus";
        render({ positions: tenPositions(), botOwners: BOTS, onshowbot: vi.fn() });
        expect(host.querySelectorAll('[data-testid="bot-owner-badge"]')).toHaveLength(8);
        expect(host.querySelectorAll('[data-testid="manual-badge"]')).toHaveLength(2);
    });
});

describe("FEAT-0824 — aggregates", () => {
    it("are exact under Decimal and state open risk and the unprotected remainder", () => {
        plans.table = {
            BTCUSDT: { loss: { triggerPrice: "95" } },
            ETHUSDT: { loss: { triggerPrice: "90" } },
        };
        render({ positions: tenPositions(), botOwners: BOTS, onshowbot: vi.fn() });

        // 0.1+0.2+0.3-0.05+1+2+3-4+5+6 = 13.55 — a float sum drifts here.
        expect(text("fleet-pnl")).toBe(`+${formatDynamicDecimal(new Decimal("13.55"))}`);
        expect(text("fleet-count")).toBe("10");
        // 10 × (2 × 110)
        expect(text("fleet-exposure")).toBe(formatDynamicDecimal(new Decimal("2200")));
        // Protected longs/shorts on BTC (rsi-1 long, wk-1 short) and ETH
        // (rsi-2 long, man-1 short). Long: (100-95)*2=10, (100-90)*2=20.
        // Short with a stop at 95 / 90 is already past entry → 0.
        expect(text("fleet-open-risk")).toBe(formatDynamicDecimal(new Decimal("30")));
        expect(text("fleet-unprotected")).toContain("6 without a known stop");
    });

    it("match the book after a reload and after a reconciliation that closed a position", () => {
        const book = tenPositions();
        render({ positions: book, botOwners: BOTS, onshowbot: vi.fn() });
        const first = [text("fleet-pnl"), text("fleet-exposure"), text("fleet-count")];

        // Reload: same book, fresh mount.
        render({ positions: tenPositions(), botOwners: BOTS, onshowbot: vi.fn() });
        expect([text("fleet-pnl"), text("fleet-exposure"), text("fleet-count")]).toEqual(first);

        // Reconciliation: the venue no longer has brk-2 (−4).
        render({
            positions: tenPositions().filter((p) => p.positionId !== "brk-2"),
            botOwners: BOTS,
            onshowbot: vi.fn(),
        });
        expect(text("fleet-count")).toBe("9");
        expect(text("fleet-pnl")).toBe(`+${formatDynamicDecimal(new Decimal("17.55"))}`);
        expect(text("fleet-exposure")).toBe(formatDynamicDecimal(new Decimal("1980")));
    });

    it("leave an unpriced leg out of the PnL and say so", () => {
        render({
            positions: [
                position("a", "BTCUSDT", "10"),
                position("b", "ETHUSDT", "-999", { unpriced: true }),
            ],
        });
        expect(text("fleet-pnl")).toBe(`+${formatDynamicDecimal(new Decimal("10"))}`);
        expect(text("fleet-unpriced")).toContain("1 unpriced");
    });

    it("do not move when the list is filtered — they describe the account, not the view", () => {
        render({ positions: tenPositions(), botOwners: BOTS, onshowbot: vi.fn() });
        const before = text("fleet-pnl");
        choose("fleet-filter", "manual");
        expect(rows()).toHaveLength(2);
        expect(text("fleet-pnl")).toBe(before);
        expect(text("fleet-count")).toBe("10");
    });
});

describe("FEAT-0824 — sorting and filtering never drop or double a row", () => {
    it("every sort shows the same ten rows", () => {
        render({ positions: tenPositions(), botOwners: BOTS, onshowbot: vi.fn() });
        const all = [...rowIds()].sort();
        for (const key of ["symbol", "owner", "pnl", "age"]) {
            choose("fleet-sort", key);
            expect(host.querySelector<HTMLSelectElement>('[data-testid="fleet-sort"]')!.value).toBe(key);
            expect(rows()).toHaveLength(10);
            expect([...rowIds()].sort()).toEqual(all);
        }
    });

    it("sorts by PnL worst first and by owner with manual last", () => {
        render({ positions: tenPositions(), botOwners: BOTS, onshowbot: vi.fn() });
        choose("fleet-sort", "pnl");
        expect(rowIds().slice(0, 2)).toEqual(["brk-2", "wk-1"]);
        choose("fleet-sort", "owner");
        expect(rowIds().slice(-2)).toEqual(["man-1", "man-2"]);
    });

    it("filters by manual, bots and one bot, and restores all ten", () => {
        render({ positions: tenPositions(), botOwners: BOTS, onshowbot: vi.fn() });

        choose("fleet-filter", "manual");
        expect(rowIds().sort()).toEqual(["man-1", "man-2"]);
        expect(text("fleet-showing")).toBe("Showing 2 of 10");

        choose("fleet-filter", "bots");
        expect(rows()).toHaveLength(8);

        choose("fleet-filter", "bot:bot-weekly");
        expect(rowIds().sort()).toEqual(["wk-1", "wk-2", "wk-3"]);

        choose("fleet-filter", "all");
        expect(rows()).toHaveLength(10);
        expect(new Set(rowIds()).size).toBe(10);
        expect(host.querySelector('[data-testid="fleet-showing"]')).toBeNull();
    });

    it("falls back to all when the filtered bot's last position closes", () => {
        render({ positions: tenPositions(), botOwners: BOTS, onshowbot: vi.fn() });
        choose("fleet-filter", "bot:bot-break");
        expect(rows()).toHaveLength(2);

        // Same list instance, new book — the bot's positions are gone.
        const withoutBreak = tenPositions().filter((p) => !p.positionId!.startsWith("brk"));
        render({ positions: withoutBreak, botOwners: BOTS, onshowbot: vi.fn() });
        expect(rows()).toHaveLength(8);
    });

    it("renders two rows that share a positionId instead of throwing or losing one", () => {
        render({
            positions: [
                position("dup", "BTCUSDT", "1"),
                position("dup", "BTCUSDT", "2", { side: "short" }),
            ],
        });
        expect(rows()).toHaveLength(2);
    });
});

describe("FEAT-0824 — empty and single states", () => {
    it("shows the empty message and no fleet chrome for no positions", () => {
        render({ positions: [] });
        expect(host.textContent).toContain(en.positionsList.noOpenPositions);
        expect(host.querySelector('[data-testid="fleet-aggregates"]')).toBeNull();
    });

    it("shows a single position as a plain row — no toolbar, no totals strip", () => {
        render({ positions: [position("only", "BTCUSDT", "1")] });
        expect(rows()).toHaveLength(1);
        expect(host.querySelector('[data-testid="fleet-toolbar"]')).toBeNull();
        expect(host.querySelector('[data-testid="fleet-aggregates"]')).toBeNull();
    });
});

describe("FEAT-0824 — keyboard and accessible names at N=24", () => {
    function twentyFour(): OMSPosition[] {
        return Array.from({ length: 24 }, (_, i) =>
            position(`p-${String(i).padStart(2, "0")}`, `C${String(i).padStart(2, "0")}USDT`, String(i)),
        );
    }

    it("gives every row an accessible name with symbol, owner and PnL", () => {
        render({ positions: twentyFour(), botOwners: new Map(), onshowbot: vi.fn() });
        expect(rows()).toHaveLength(24);
        for (const row of rows()) {
            const label = row.getAttribute("aria-label") ?? "";
            expect(label).toMatch(/^C\d\dUSDT long, owner Manual, PnL /);
        }
        expect(host.querySelector('[role="list"]')?.getAttribute("aria-label")).toBe("Open positions (24)");
    });

    it("keeps one tab stop in the list and moves between rows with the arrow keys", () => {
        render({ positions: twentyFour() });
        expect(rows().filter((r) => r.tabIndex === 0)).toHaveLength(1);

        const first = rows()[0];
        first.focus();
        first.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
        expect(document.activeElement).toBe(rows()[1]);

        rows()[1].dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
        expect(document.activeElement).toBe(rows()[23]);

        rows()[23].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
        expect(document.activeElement).toBe(rows()[23]); // clamped, no wrap

        rows()[23].dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
        expect(document.activeElement).toBe(rows()[0]);
    });

    it("leaves keys pressed on a control inside a row to that control", () => {
        render({ positions: twentyFour() });
        const button = rows()[0].querySelector("button")!;
        button.focus();
        button.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
        expect(document.activeElement).toBe(button);
    });
});
