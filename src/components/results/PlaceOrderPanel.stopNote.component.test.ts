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

/*
 * BUG-0649 — what the order form says about a stop the venue cannot carry.
 *
 * Observed live on Bitget: the panel promised the stop "is placed as a second
 * request" and the gate, one click later, refused because it cannot be placed
 * as a separate order either. Two conditions for one fact, written twice.
 *
 * These cases mount the panel and read what the trader actually sees, because
 * the defect was in the sentence — not in a predicate. A unit test of a helper
 * would have been green before the fix and proved nothing.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import { Decimal } from "decimal.js";
import en from "../../locales/locales/en.json";
import type { TradingPairInfo } from "../../stores/market/types";

import PlaceOrderPanel from "./PlaceOrderPanel.svelte";

vi.mock("../../services/logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const settings = vi.hoisted(() => ({
    apiProvider: "bitget" as string,
    autoUpdatePriceInput: false,
}));
vi.mock("../../stores/settings.svelte", () => ({ settingsState: settings }));

vi.mock("../../stores/paperTrading.svelte", () => ({
    paperState: { enabled: false, config: {} },
}));

vi.mock("../../stores/results.svelte", () => ({ resultsState: { isMarginExceeded: false } }));

vi.mock("../../stores/accountVerification.svelte", async (importOriginal) => {
    const actual =
        await importOriginal<typeof import("../../stores/accountVerification.svelte")>();
    return {
        ...actual,
        accountVerification: {
            statusFor: () => "verified",
            startClock: () => () => undefined,
        },
        subjectFor: () => ({
            id: "acct-1",
            exchange: "bitget",
            keys: { key: "k", secret: "s" },
        }),
        ensureCurrent: vi.fn(async () => undefined),
    };
});

// The one thing these cases turn: what the venue can do with a stop. `capsMock`
// is declared before this factory so the two share it — `vi.mock` hoists, and a
// plain const above would still be in its temporal dead zone inside the factory.
const capsMock = vi.hoisted(() => ({
    tpSlAtEntry: false,
    tpSlStandalone: false,
}));
vi.mock("../../services/exchangeCapabilities", async (importOriginal) => {
    const actual =
        await importOriginal<typeof import("../../services/exchangeCapabilities")>();
    // A known exchange, so the panel takes its normal path and renders the
    // summary. Only the two stop flags come from the test.
    const known = { ...actual.UNKNOWN_EXCHANGE, isKnownExchange: () => true };
    return {
        ...actual,
        capabilitiesOf: () => ({ ...known, ...capsMock }),
        isKnownExchange: () => true,
    };
});

const tradeData = vi.hoisted(() => ({
    symbol: "BTCUSDT",
    tradeType: "long",
    positionSize: "0.5",
    entryPrice: "60000",
    stopLossPrice: "58000",
    requiredMargin: "1000",
}));
vi.mock("../../stores/trade.svelte", () => ({
    tradeState: {
        get symbol() {
            return tradeData.symbol;
        },
        get leverage() {
            return "10";
        },
        get remoteMarginMode() {
            return "CROSSED";
        },
        get currentTradeData() {
            // Built here, not in the hoisted block: `vi.hoisted` runs before the
            // imports, so `Decimal` does not exist yet there.
            return {
                symbol: tradeData.symbol,
                tradeType: tradeData.tradeType,
                targets: [],
                accountSize: new Decimal("10000"),
                riskPercentage: new Decimal("1"),
                leverage: new Decimal("10"),
                positionSize: new Decimal(tradeData.positionSize),
                entryPrice: new Decimal(tradeData.entryPrice),
                stopLossPrice: new Decimal(tradeData.stopLossPrice),
                requiredMargin: new Decimal(tradeData.requiredMargin),
            };
        },
        get remoteAccountStateAt() {
            return Date.now();
        },
    },
}));

const symbolMeta: TradingPairInfo = {
    minTradeVolume: "0.001",
    pricePrecision: 1,
    quantityPrecision: 3,
    tickSize: "0.1",
    symbolStatus: "OPEN",
    baseCoin: "BTC",
    quoteCoin: "USDT",
};
vi.mock("../../stores/market.svelte", () => ({
    marketState: {
        get symbolMeta() {
            return symbolMeta;
        },
        get data() {
            return {};
        },
        setSymbolMeta: () => undefined,
    },
    META_FETCH_RETRY_MS: 30_000,
}));

vi.mock("../../services/exchange", () => ({
    activeExchange: () => ({
        capabilities: capsMock,
        account: {
            fetchTradingPairInfo: vi.fn().mockResolvedValue(undefined),
            fetchLeverageMarginMode: vi.fn().mockResolvedValue(undefined),
        },
    }),
}));

vi.mock("../../stores/modal.svelte", () => ({ modalState: { show: vi.fn() } }));
vi.mock("../../services/orderPlacementService", () => ({
    orderPlacementService: { placeEntryGroup: vi.fn() },
    narrowTradeType: (t: string) => {
        const n = t.toLowerCase();
        return n === "long" || n === "short" ? n : null;
    },
}));
vi.mock("../../services/toastService.svelte", () => ({
    toastService: { error: vi.fn(), success: vi.fn() },
}));
vi.mock("../../stores/ui.svelte", () => ({ uiState: { showError: vi.fn() } }));

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

let host: HTMLElement;
let component: unknown;

beforeEach(() => {
    flushSync();
    // The no-stop case turns the stop off; without this it leaks into every
    // later case and they fail for the wrong reason.
    tradeData.stopLossPrice = "58000";
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

function render(): string {
    component = mount(PlaceOrderPanel, { target: host }) as never;
    flushSync();
    return host.textContent ?? "";
}

describe("BUG-0649 — the stop note names what the venue can actually do", () => {
    // Read from the locale table rather than hardcoded copy: a rewording of the
    // sentence should fail nothing, and a rewording that drops the distinguishing
    // clause must not leave `not.toContain` green for the wrong reason.
    const UNPROTECTED = lookup("orderEntry.notes.unprotectedEntry");
    const SECOND_REQUEST = lookup("orderEntry.notes.noAttachedProtection");

    it("does not promise a second request on a venue that cannot send one", () => {
        capsMock.tpSlAtEntry = false;
        capsMock.tpSlStandalone = false;

        const text = render();

        expect(text).toContain(UNPROTECTED);
        // The promise that could not be kept, and that the gate contradicted one
        // click later on the same screen.
        expect(text).not.toContain(SECOND_REQUEST);
    });

    it("still promises the second request where the venue really sends one", () => {
        capsMock.tpSlAtEntry = false;
        capsMock.tpSlStandalone = true;

        expect(render()).toContain(SECOND_REQUEST);
    });

    /*
     * The note has to answer two questions — what the venue can do, and whether
     * there is a stop to talk about. Answering only the first put "clear the
     * stop" on every Bitget entry that carries no stop at all: an instruction
     * that cannot be carried out, for a refusal the gate would never raise.
     */
    it("says nothing on a venue that cannot carry a stop when there is none", () => {
        capsMock.tpSlAtEntry = false;
        capsMock.tpSlStandalone = false;
        tradeData.stopLossPrice = "0";

        const text = render();

        // A positive anchor first, so this cannot pass by the panel not
        // rendering at all.
        expect(text).toContain(lookup("orderEntry.summary.stop"));
        expect(text).not.toContain(UNPROTECTED);
        expect(text).not.toContain(SECOND_REQUEST);
    });

    it("says nothing about stops where they attach", () => {
        capsMock.tpSlAtEntry = true;
        capsMock.tpSlStandalone = true;

        const text = render();

        // Positive anchor: two absence assertions alone would also pass if the
        // summary stopped rendering altogether.
        expect(text).toContain(lookup("orderEntry.summary.stop"));
        expect(text).not.toContain(SECOND_REQUEST);
        expect(text).not.toContain(UNPROTECTED);
    });
});
