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
 * FEAT-0017 — what the panel offers, per exchange.
 *
 * The acceptance criterion is that a control for a capability the active venue
 * lacks is not reachable, *tested per exchange*. Mounting once against one
 * venue cannot show that, so every case here runs the same assertion twice
 * with `apiProvider` switched underneath.
 *
 * The second rule these pin is the one that is easy to get backwards: an
 * absent capability produces a **disabled control carrying a reason**, never a
 * missing one. A control that vanishes reads as a feature Cachy lacks; a
 * disabled one says the venue will not take it.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import { Decimal } from "decimal.js";
import en from "../../locales/locales/en.json";

import type { TradingPairInfo } from "../../types/apiSchemas";

vi.mock("../../services/logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const settings = vi.hoisted(() => ({
    apiProvider: "bitunix" as string,
    autoUpdatePriceInput: true,
}));
vi.mock("../../stores/settings.svelte", () => ({ settingsState: settings }));

const paperStateMock = vi.hoisted(() => ({ enabled: false }));
vi.mock("../../stores/paperTrading.svelte", () => ({ paperState: paperStateMock }));

const mockTradeData = vi.hoisted(() => ({
    symbol: "BTCUSDT",
    tradeType: "LONG" as const,
    positionSize: null as Decimal | null,
    entryPrice: null as Decimal | null,
    stopLossPrice: null as Decimal | null,
    targets: [] as Array<{ price: Decimal; percentage: number }>,
    remoteAccountStateAt: Date.now(),
}));

vi.mock("../../stores/trade.svelte", () => ({
    tradeState: {
        get currentTradeData() {
            return mockTradeData;
        },
        get remoteAccountStateAt() {
            return mockTradeData.remoteAccountStateAt;
        },
    },
}));

const mockSymbolMetaStore = vi.hoisted(() => ({
    symbolMeta: {} as Record<string, TradingPairInfo>,
}));

vi.mock("../../stores/market.svelte", () => ({
    marketState: {
        get symbolMeta() {
            return mockSymbolMetaStore.symbolMeta;
        },
        get data() {
            return {};
        },
        setSymbolMeta: (symbol: string, meta: TradingPairInfo) => {
            mockSymbolMetaStore.symbolMeta[symbol] = meta;
        },
    },
}));

// Resolves rather than returning undefined: the real port returns a promise,
// and a bare vi.fn() hands the panel `undefined` to await. That surfaced as a
// stray rejection attributed to this file only under a full parallel run.
const fetchTradingPairInfoMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../../services/exchange", () => ({
    activeExchange: () => ({
        account: { fetchTradingPairInfo: fetchTradingPairInfoMock },
    }),
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

import PlaceOrderPanel from "./PlaceOrderPanel.svelte";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

const TRADABLE: TradingPairInfo = {
    symbol: "BTCUSDT",
    basePrecision: 4,
    quotePrecision: 2,
    minTradeVolume: "0.001",
    maxLimitOrderVolume: "100",
    maxMarketOrderVolume: "50",
    symbolStatus: "OPEN",
    isApiSupported: true,
};

beforeEach(() => {
    vi.clearAllMocks();
    fetchTradingPairInfoMock.mockResolvedValue(undefined);
    settings.apiProvider = "bitunix";
    settings.autoUpdatePriceInput = true;
    mockSymbolMetaStore.symbolMeta = { BTCUSDT: { ...TRADABLE } };
    mockTradeData.positionSize = new Decimal("0.02");
    mockTradeData.entryPrice = new Decimal("50000");
    mockTradeData.stopLossPrice = new Decimal("49000");
    mockTradeData.targets = [{ price: new Decimal("52000"), percentage: 100 }];
    mockTradeData.remoteAccountStateAt = Date.now();
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component);
    component = null;
    host.remove();
});

async function settle(rounds = 6) {
    for (let i = 0; i < rounds; i++) {
        flushSync();
        await Promise.resolve();
    }
    flushSync();
}

/** Mounts the panel with `exchange` active. */
async function mountFor(exchange: string) {
    settings.apiProvider = exchange;
    component = mount(PlaceOrderPanel, { target: host }) as never;
    await settle();
}

function typeButtons(): HTMLButtonElement[] {
    return Array.from(host.querySelectorAll<HTMLButtonElement>("button.type-btn"));
}

function tifSelect(): HTMLSelectElement | null {
    return host.querySelector<HTMLSelectElement>("#order-tif");
}

/** Switches the panel to limit entry, where time-in-force becomes relevant. */
async function selectLimit() {
    const limitBtn = typeButtons().find(
        (b) => b.textContent?.trim() === lookup("orderEntry.type.limit"),
    );
    limitBtn?.click();
    await settle();
}

describe("FEAT-0017 — PlaceOrderPanel reads exchange capabilities", () => {
    describe("order types, per exchange", () => {
        it.each(["bitunix", "bitget"])("offers market and limit on %s", async (exchange) => {
            await mountFor(exchange);

            const labels = typeButtons().map((b) => b.textContent?.trim());
            expect(labels).toEqual([
                lookup("orderEntry.type.market"),
                lookup("orderEntry.type.limit"),
            ]);
            expect(typeButtons().every((b) => !b.disabled)).toBe(true);
        });

        /*
         * The venue neither declares does not get a button at all here,
         * because `ALL_TYPES` in the panel omits it. That is the one place a
         * missing control is right: no venue supports it, so there is no
         * "this exchange can't" to explain.
         */
        it.each(["bitunix", "bitget"])("offers no trigger button on %s", async (exchange) => {
            await mountFor(exchange);
            expect(host.textContent).not.toContain(lookup("orderEntry.type.trigger"));
        });

        it("disables every order type on an exchange it has never heard of", async () => {
            await mountFor("kraken");

            expect(typeButtons().length).toBeGreaterThan(0);
            expect(typeButtons().every((b) => b.disabled)).toBe(true);
        });

        it("explains an undeclared exchange rather than leaving the buttons bare", async () => {
            await mountFor("kraken");

            const reason = lookup("orderEntry.unsupported.unknownExchange");
            expect(typeButtons().every((b) => b.title === reason)).toBe(true);
        });
    });

    describe("time in force, per exchange", () => {
        it("offers Bitunix's four values on a limit order", async () => {
            await mountFor("bitunix");
            await selectLimit();

            const select = tifSelect();
            expect(select).not.toBeNull();
            expect(select?.disabled).toBe(false);
            const options = Array.from(select?.options ?? []).map((o) => o.value);
            expect(options).toEqual(["GTC", "IOC", "FOK", "POST_ONLY"]);
        });

        /*
         * Bitget declares an empty list. The control stays on screen and
         * becomes unusable, rather than disappearing — the difference between
         * "this venue does not take one" and "Cachy forgot to build it".
         */
        it("shows the control disabled on Bitget, which declares none", async () => {
            await mountFor("bitget");
            await selectLimit();

            const select = tifSelect();
            expect(select).not.toBeNull();
            expect(select?.disabled).toBe(true);
        });

        it("offers no selectable time-in-force value on Bitget", async () => {
            await mountFor("bitget");
            await selectLimit();

            const values = Array.from(tifSelect()?.options ?? []).map((o) => o.value);
            expect(values).not.toContain("IOC");
            expect(values).not.toContain("FOK");
            expect(values).not.toContain("POST_ONLY");
        });

        it("says why the control is dead on Bitget", async () => {
            await mountFor("bitget");
            await selectLimit();

            const holder = tifSelect()?.closest("div");
            expect(holder?.getAttribute("title")).toBe(
                lookup("orderEntry.unsupported.timeInForce"),
            );
        });

        it.each(["bitunix", "bitget"])(
            "keeps time in force laid out but invisible on a market order on %s",
            async (exchange) => {
                await mountFor(exchange);
                // Market is the default entry type; TIF does not apply, but
                // the control keeps its box so the rows below never jump.
                const select = tifSelect();
                expect(select).not.toBeNull();
                const wrap = select!.closest("div")!;
                expect(wrap.classList.contains("invisible")).toBe(true);
                expect(wrap.getAttribute("aria-hidden")).toBe("true");
            },
        );

        /*
         * A venue declaring none offers nothing selectable but GTC, so a
         * maker-only instruction cannot be standing when the order is built.
         *
         * The runtime provider switch itself is not exercised here: the
         * settings store is a plain mock, so assigning `apiProvider` mid-test
         * would prove the mock is non-reactive rather than prove anything
         * about the panel. What guarantees the switch is that the submitted
         * value is `$derived` from `caps` instead of reset by an effect — it
         * cannot lag the venue. The consequences of getting it wrong are
         * pinned where they bite: `orderPlacementService.timeInForce.test.ts`
         * for the drop semantics, `orderGate.capabilities.test.ts` for the
         * refusal.
         */
        it("leaves only GTC standing on a venue that declares none", async () => {
            await mountFor("bitget");
            await selectLimit();

            const select = tifSelect();
            expect(select?.disabled).toBe(true);
            expect(select?.value).toBe("GTC");
        });

        it("keeps a value the venue declares selectable", async () => {
            await mountFor("bitunix");
            await selectLimit();

            const select = tifSelect();
            select!.value = "IOC";
            select!.dispatchEvent(new Event("change", { bubbles: true }));
            await settle();

            expect(tifSelect()?.value).toBe("IOC");
        });
    });

    describe("time in force keeps its box in market mode (no layout jump)", () => {
        it("renders the control hidden but present on a market order", async () => {
            await mountFor("bitunix");

            const select = tifSelect();
            expect(select).not.toBeNull();
            const wrap = select!.closest("div")!;
            expect(wrap.classList.contains("invisible")).toBe(true);
            expect(wrap.getAttribute("aria-hidden")).toBe("true");
        });

        it("reveals the same control on a limit order", async () => {
            await mountFor("bitunix");
            await selectLimit();

            const wrap = tifSelect()!.closest("div")!;
            expect(wrap.classList.contains("invisible")).toBe(false);
            expect(wrap.getAttribute("aria-hidden")).toBe("false");
        });
    });

    describe("attached protection, per exchange", () => {
        it("says nothing about unattached protection on Bitunix, which attaches it", async () => {
            await mountFor("bitunix");
            expect(host.textContent).not.toContain(
                lookup("orderEntry.notes.noAttachedProtection"),
            );
        });

        /*
         * Bitget places the stop as a second request. The trader is told,
         * because a briefly unprotected position is a fact about their money,
         * not an implementation detail.
         */
        it("warns that Bitget cannot attach the stop to the entry", async () => {
            await mountFor("bitget");
            expect(host.textContent).toContain(lookup("orderEntry.notes.noAttachedProtection"));
        });
    });
});
