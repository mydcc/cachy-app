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
 * FEAT-0808 review — the sidebar glue, end to end.
 *
 * The tab content and the position rows were each pinned in their own
 * files, but nothing pinned the wiring between them: the bot row's link
 * must actually switch the tab and highlight the row it names, the
 * position row's badge must switch back, and the paper-mode gate must
 * withdraw the link when the Positions tab stops showing the book the
 * link resolves into. Against the real projection and the real simulated
 * book — the dedup test's mock set, with `PositionsList` and `BotsList`
 * left real.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";

vi.mock("$app/env", () => ({ browser: true, dev: false }));

import { Decimal } from "decimal.js";

import type { RuleDocument } from "../../lib/rules/types";
import { RULES_STORAGE_KEY } from "../../services/alertEngine/migrateAlertsToRules";
import { paperExchange, setPaperPriceFeed } from "../../services/paperExchange";
import en from "../../locales/locales/en.json";

const settings = vi.hoisted(() => ({
    apiProvider: "bitunix" as string,
    activeAccountId: "acc-1",
    accounts: [
        {
            id: "acc-1",
            name: "test",
            exchange: "bitunix",
            keys: { key: "test-key-0123456789", secret: "test-secret-0123456789" },
        },
    ],
    hideUnfilledOrders: false,
    showStalePriceBadge: true,
    positionViewMode: "detailed",
    pnlViewMode: "value",
}));
vi.mock("../../stores/settings.svelte", () => ({ settingsState: settings }));

vi.mock("../../stores/market.svelte", () => ({ marketState: { data: {} } }));

vi.mock("../../stores/trade.svelte", () => ({ tradeState: {} }));

vi.mock("../../services/marketWatcher", () => ({
    marketWatcher: { register: vi.fn(), unregister: vi.fn() },
}));

vi.mock("../../stores/tpsl.svelte", () => ({
    tpSlState: {
        ensureFresh: vi.fn(),
        invalidate: vi.fn(),
        // The real PositionsList reads these per row; the dedup test could
        // stub them away because it stubbed the list itself.
        hasPlansFor: vi.fn(() => false),
        plansFor: vi.fn(() => ({})),
    },
}));

vi.mock("../../services/exchange", () => ({ activeExchange: () => ({ capabilities: {}, supports: {} }) }));

vi.mock("../../lib/appAuth", () => ({ appFetch: vi.fn() }));

vi.mock("../../services/logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function lookup(key: string): string {
    return key
        .split(".")
        .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], en) as string;
}

vi.mock("../../locales/i18n", async () => {
    const { readable } = await import("svelte/store");
    return {
        _: readable((key: string, options?: { values?: Record<string, unknown> }) => {
            const template = lookup(key) ?? key;
            return Object.entries(options?.values ?? {}).reduce(
                (text, [name, replacement]) => text.replaceAll(`{${name}}`, String(replacement)),
                template,
            );
        }),
        locale: readable("en"),
        setLocale: vi.fn(),
    };
});

async function stubComponent() {
    return { default: (await import("../../tests/helpers/EmptyStub.svelte")).default };
}
vi.mock("./ActiveAccountChip.svelte", stubComponent);
vi.mock("./AccountSummary.svelte", stubComponent);
vi.mock("./OpenOrdersList.svelte", stubComponent);
vi.mock("./OrderHistoryList.svelte", stubComponent);
vi.mock("./TpSlList.svelte", stubComponent);
vi.mock("./ClosePositionModal.svelte", stubComponent);
vi.mock("./ConfirmActionModal.svelte", stubComponent);
vi.mock("./AdjustMarginModal.svelte", stubComponent);
vi.mock("./AddToPositionModal.svelte", stubComponent);
vi.mock("./TpSlCreateModal.svelte", stubComponent);

import PositionsSidebar from "./PositionsSidebar.svelte";
import { accountState } from "../../stores/account.svelte";
import { alertState } from "../../stores/alerts.svelte";
import { botsState } from "../../stores/botsState.svelte";
import { paperState } from "../../stores/paperTrading.svelte";
import { webcrypto } from "node:crypto";

// happy-dom ships no `crypto.subtle`, and the signed-request module refuses
// to run without it — Node's WebCrypto is the same API the browser exposes.
Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });

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

async function settle(budgetMs = 150) {
    const deadline = Date.now() + budgetMs;
    do {
        flushSync();
        await new Promise((resolve) => setTimeout(resolve, 0));
    } while (Date.now() < deadline);
    flushSync();
}

async function mountSidebar(): Promise<void> {
    component = mount(PositionsSidebar, { target: host });
    await settle();
}

function clickTab(name: string): void {
    host.querySelector<HTMLButtonElement>(`[data-testid="tab-${name}"]`)!.click();
    flushSync();
}

function botRow(): HTMLElement | null {
    return host.querySelector<HTMLElement>('[data-testid="bot-row-bot-1"]');
}

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    accountState.reset();
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
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

describe("FEAT-0808 — the sidebar's bot glue, end to end", () => {
    it("carries a bot's link through to the highlighted position row and back", async () => {
        seedBots(botDocument("bot-1"));
        await openAs("bot-1");
        await mountSidebar();

        // Paper mode is on, so the Positions tab is showing the book the
        // link resolves into — the state the link exists for.
        expect(accountState.positions.map((p) => p.positionId)).toEqual([
            paperState.positions[0].positionId,
        ]);

        clickTab("bots");
        const link = botRow()!.querySelector<HTMLButtonElement>('[data-testid="bot-view-position"]');
        expect(link).not.toBeNull();
        link!.click();
        await settle();

        // The link switched the tab and highlighted the row it named.
        expect(
            host.querySelector<HTMLElement>('[data-testid="tab-positions"]')?.getAttribute("data-active"),
        ).toBe("true");
        const positionId = paperState.positions[0].positionId;
        const row = host.querySelector<HTMLElement>(`[data-position-id="${positionId}"]`);
        expect(row).not.toBeNull();
        expect(row!.className.split(/\s+/)).toContain("border-[var(--accent-color)]");

        // The badge on that row names the bot and links back to the Bots tab.
        const badge = row!.querySelector<HTMLButtonElement>('[data-testid="bot-owner-badge"]');
        expect(badge).not.toBeNull();
        expect(badge!.textContent).toContain("bot bot-1");
        badge!.click();
        await settle();
        expect(
            host.querySelector<HTMLElement>('[data-testid="tab-bots"]')?.getAttribute("data-active"),
        ).toBe("true");
        expect(botRow()).not.toBeNull();
    });

    it("withdraws the position link while the Positions tab shows no paper book", async () => {
        seedBots(botDocument("bot-1"));
        await openAs("bot-1");
        paperState.setEnabled(false);
        await mountSidebar();

        clickTab("bots");
        const row = botRow()!;
        // The bot still owns the position and the row still says so — the
        // facts come from the book, not from the tab.
        expect(row.querySelector<HTMLElement>('[data-testid="bot-state-chip"]')?.textContent).toContain(
            lookup("botsList.state.in_position"),
        );
        expect(row.querySelector('[data-testid="bot-position-facts"]')).not.toBeNull();
        // But the link resolves into a tab that is not showing that row, so
        // it is absent rather than dead.
        expect(row.querySelector('[data-testid="bot-view-position"]')).toBeNull();
    });
});
