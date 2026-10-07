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
 * BUG-0648 — the order must not be built from a calculation the trader has
 * undone.
 *
 * Observed live on Bitget: the gate refused an entry with
 * `unplaceableStop` and told the trader to clear the stop. Clearing it produced
 * the identical refusal and the summary still read `STOP 2533.8`.
 *
 * `tradeState.currentTradeData` is the last calculation that *succeeded*, and
 * nothing nulls it when a later one is refused — `clearResults()` resets
 * `resultsState` only. So the panel kept rendering it, and `submit()` kept
 * building the order from it: the summary went stale, and the panel rendered the
 * app saying "here is your order" and "nothing is calculated" at the same time.
 *
 * These cases do not try to fix the lifetime of that object — that is the open
 * question the item records. They pin the narrow one: whatever it holds, a
 * submit may not send protection or a price the inputs no longer state.
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

const settings = vi.hoisted(() => ({ apiProvider: "bitunix", autoUpdatePriceInput: false }));
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
            exchange: "bitunix",
            keys: { key: "k", secret: "s" },
        }),
        ensureCurrent: vi.fn(async () => undefined),
    };
});

vi.mock("../../services/exchangeCapabilities", async (importOriginal) => {
    const actual =
        await importOriginal<typeof import("../../services/exchangeCapabilities")>();
    return { ...actual, isKnownExchange: () => true };
});

const placeEntryGroupMock = vi.hoisted(() => vi.fn());
vi.mock("../../services/orderPlacementService", () => ({
    orderPlacementService: { placeEntryGroup: placeEntryGroupMock },
    narrowTradeType: (t: string) => {
        const n = t.toLowerCase();
        return n === "long" || n === "short" ? n : null;
    },
}));
// Resolves `true` so the flow actually reaches `placeEntryGroup` — without
// this the control case places nothing and every stale case passes for the
// wrong reason.
const showMock = vi.hoisted(() => vi.fn(async () => true));
vi.mock("../../stores/modal.svelte", () => ({ modalState: { show: showMock } }));

/**
 * Two halves that can disagree, which is the whole defect.
 *
 * `calculated` is what the panel renders and builds the order from — the last
 * calculation that succeeded. `inputs` is what the trader has in the form right
 * now. Nothing in the codebase keeps them in step when a recalculation is
 * refused, so the test drives them apart by hand.
 */
const split = vi.hoisted(() => ({
    calculated: {
        symbol: "BTCUSDT",
        tradeType: "long",
        entry: "60000",
        stop: "58000",
        positionSize: "0.5",
        requiredMargin: "1000",
    },
    inputs: {
        symbol: "BTCUSDT",
        tradeType: "long",
        entry: "60000",
        stop: "58000",
    },
    /** Legs travel with the order, so a deleted leg is stale too. */
    calculatedTargets: [] as string[],
    inputTargets: [] as string[],
}));

vi.mock("../../stores/trade.svelte", () => ({
    tradeState: {
        get symbol() {
            return split.inputs.symbol;
        },
        get tradeType() {
            return split.inputs.tradeType;
        },
        get entryPrice() {
            return split.inputs.entry;
        },
        get stopLossPrice() {
            return split.inputs.stop;
        },
        get targets() {
            return split.inputTargets.map((price) => ({ price, percentage: 100 }));
        },
        get leverage() {
            return "10";
        },
        get remoteMarginMode() {
            return "CROSSED";
        },
        get remoteAccountStateAt() {
            return Date.now();
        },
        get currentTradeData() {
            // Built here, not in the hoisted block: `vi.hoisted` runs before the
            // imports, so `Decimal` does not exist yet there.
            return {
                symbol: split.calculated.symbol,
                tradeType: split.calculated.tradeType,
                targets: split.calculatedTargets.map((price) => ({
                    price: new Decimal(price),
                    percentage: 100,
                })),
                accountSize: new Decimal("10000"),
                riskPercentage: new Decimal("1"),
                leverage: new Decimal("10"),
                positionSize: new Decimal(split.calculated.positionSize),
                entryPrice: new Decimal(split.calculated.entry),
                stopLossPrice: new Decimal(split.calculated.stop),
                requiredMargin: new Decimal(split.calculated.requiredMargin),
            };
        },
    },
}));

function symbolMetaFor(base: string): TradingPairInfo {
    return {
        minTradeVolume: "0.001",
        pricePrecision: 1,
        quantityPrecision: 3,
        tickSize: "0.1",
        symbolStatus: "OPEN",
        baseCoin: base,
        quoteCoin: "USDT",
    };
}

// Keyed by symbol — `marketState.symbolMeta` is a record, not one entry. Handing
// the panel a bare object leaves `hasMeta` false and the button disabled, which
// makes every case below pass without a single order being attempted.
const metaStore = { BTCUSDT: symbolMetaFor("BTCUSDT"), ETHUSDT: symbolMetaFor("ETHUSDT") };
vi.mock("../../stores/market.svelte", () => ({
    marketState: {
        get symbolMeta() {
            return metaStore;
        },
        get data() {
            return {};
        },
        setSymbolMeta: (symbol: string, meta: TradingPairInfo) => {
            metaStore[symbol as keyof typeof metaStore] = meta;
        },
    },
    META_FETCH_RETRY_MS: 30_000,
}));

vi.mock("../../services/exchange", () => ({
    activeExchange: () => ({
        capabilities: { tpSlAtEntry: true, tpSlStandalone: true },
        account: {
            fetchTradingPairInfo: vi.fn().mockResolvedValue(undefined),
            fetchLeverageMarginMode: vi.fn().mockResolvedValue(undefined),
        },
    }),
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

async function settle(budgetMs = 120) {
    const deadline = Date.now() + budgetMs;
    do {
        flushSync();
        await new Promise((resolve) => setTimeout(resolve, 0));
    } while (Date.now() < deadline);
    flushSync();
}

beforeEach(() => {
    vi.clearAllMocks();
    showMock.mockResolvedValue(true);
    split.calculated.entry = "60000";
    split.calculated.stop = "58000";
    split.inputs.entry = "60000";
    split.inputs.stop = "58000";
    split.calculatedTargets = [];
    split.inputTargets = [];
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

async function submit() {
    component = mount(PlaceOrderPanel, { target: host }) as never;
    await settle();
    const button = host.querySelector<HTMLButtonElement>("button.submit-btn");
    if (!button) throw new Error("submit button not rendered");
    if (button.disabled) {
        throw new Error(
            "submit disabled — ready=false. text: " + (host.textContent ?? "").slice(0, 220),
        );
    }
    button.click();
    await settle();
}

describe("BUG-0648 — a submit may not send what the inputs no longer state", () => {
    it("places when the calculation still matches the inputs", async () => {
        await submit();
        expect(placeEntryGroupMock).toHaveBeenCalledTimes(1);
    });

    it("does not place when the stop was cleared but the calculation still holds one", async () => {
        // The live observation: the gate said "clear the stop", the trader
        // cleared it, and the order went out carrying it.
        split.inputs.stop = "";

        await submit();

        expect(placeEntryGroupMock).not.toHaveBeenCalled();
    });

    it("does not place when the entry price moved and the calculation still holds the old one", async () => {
        split.inputs.entry = "61000";

        await submit();

        expect(placeEntryGroupMock).not.toHaveBeenCalled();
    });

    it("does not place when a take-profit leg was deleted but the calculation holds it", async () => {
        split.calculatedTargets = ["65000"];
        split.inputTargets = [];

        await submit();

        expect(placeEntryGroupMock).not.toHaveBeenCalled();
    });

    it("places when the legs match, so the guard is not refusing every order", async () => {
        split.calculatedTargets = ["65000"];
        split.inputTargets = ["65000"];

        await submit();

        expect(placeEntryGroupMock).toHaveBeenCalledTimes(1);
    });

    it("does not place when the symbol changed under a stale calculation", async () => {
        split.inputs.symbol = "ETHUSDT";

        await submit();

        expect(placeEntryGroupMock).not.toHaveBeenCalled();
    });
});