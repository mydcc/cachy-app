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
 * FEAT-0328, decision 5 — one leverage, one source.
 *
 * This is the money test of that decision. A perpetuals venue has exactly one
 * leverage per symbol. Once FEAT-0328 moved the *write* out of this component
 * and into the chip, the calculator's own leverage field could have drifted
 * from what the exchange actually holds — and a calculator sizing a position
 * at 20x while the exchange sits at 10x produces a wrong position size with
 * real money behind it.
 *
 * So while a broker reports a leverage, this field mirrors it read-only. With
 * no broker value, or in paper trading, there is no remote truth to mirror and
 * the free planning input comes back.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import { Decimal } from "decimal.js";
import en from "../../locales/locales/en.json";

vi.mock("../../services/logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const tradeStateMock = vi.hoisted(() => ({
    tradeType: "long" as string,
    leverage: "20" as string | null,
    fees: "0.06" as string | null,
    symbol: "BTCUSDT",
    remoteLeverage: undefined as unknown,
    remoteMarginMode: undefined as string | undefined,
    remoteMakerFee: undefined as unknown,
    remoteTakerFee: undefined as unknown,
    feeMode: "maker_taker" as string,
}));
vi.mock("../../stores/trade.svelte", () => ({ tradeState: tradeStateMock }));

const paperStateMock = vi.hoisted(() => ({ enabled: false }));
vi.mock("../../stores/paperTrading.svelte", () => ({ paperState: paperStateMock }));

// The account controls render nothing when the venue declares no support, which
// keeps this test focused on the calculator's own field.
const supportsMock = vi.hoisted(() => ({ accountSettings: false }));
vi.mock("../../services/exchange", () => ({
    activeExchange: () => ({
        supports: supportsMock,
        account: {
            changeLeverage: vi.fn(),
            changeMarginMode: vi.fn(),
            changePositionMode: vi.fn(),
        },
    }),
}));
const settingsStateMock = vi.hoisted(() => ({
    apiProvider: "bitunix",
    feePreference: "taker" as "maker" | "taker",
    feeRates: {
        bitunix: { maker: "0.0200", taker: "0.0600" },
        bitget: { maker: "0.0200", taker: "0.0600" },
    },
}));
vi.mock("../../stores/settings.svelte", () => ({ settingsState: settingsStateMock }));
vi.mock("../../stores/market.svelte", () => ({ marketState: { symbolMeta: {} } }));
vi.mock("../../stores/account.svelte", () => ({
    accountState: { positions: [], openOrders: [], positionMode: "ONE_WAY" },
}));
vi.mock("../../stores/modal.svelte", () => ({ modalState: { show: vi.fn() } }));
vi.mock("../../services/toastService.svelte", () => ({
    toastService: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock("../../services/trackingService", () => ({ trackCustomEvent: vi.fn() }));

// The input actions are DOM sugar; a no-op keeps them out of this test's way.
vi.mock("../../utils/inputUtils", () => ({ numberInput: () => ({ destroy() {} }) }));
vi.mock("../../lib/actions/inputEnhancements", () => ({
    enhancedInput: () => ({ destroy() {} }),
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

import GeneralInputs from "./GeneralInputs.svelte";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    vi.clearAllMocks();
    paperStateMock.enabled = false;
    supportsMock.accountSettings = false;
    tradeStateMock.leverage = "20";
    tradeStateMock.fees = "0.06";
    tradeStateMock.remoteLeverage = undefined;
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

async function render() {
    component = mount(GeneralInputs, {
        target: host,
        props: {
            tradeType: "long",
            leverage: tradeStateMock.leverage,
        },
    }) as never;
    await settle();
}

describe("FEAT-0328 — one leverage, one source", () => {
    it("offers no second, editable leverage field of its own", async () => {
        /*
         * The strongest form of the guarantee: after FEAT-0328 there is one
         * leverage control in the trade panel — the chip in
         * `ExchangeAccountControls` — so there is nothing here that could be
         * edited into disagreeing with the exchange. The mocks make that
         * component render nothing (`accountSettings: false`), so anything
         * matching here would be a second control.
         */
        tradeStateMock.remoteLeverage = new Decimal(10);
        await render();

        expect(host.querySelector("#leverage-input")).toBeNull();
        expect(host.querySelector('[data-track-id="input-leverage"]')).toBeNull();
    });

    it("writes the broker's leverage into the value the calculator sizes with", async () => {
        // The mirror is not cosmetic: the sizing maths reads
        // `tradeState.leverage`, not `remoteLeverage`. The local value said
        // 20; the exchange says 10, and the exchange wins.
        tradeStateMock.leverage = "20";
        tradeStateMock.remoteLeverage = new Decimal(10);
        await render();

        expect(tradeStateMock.leverage).toBe("10");
    });

    it("leaves the local value alone when no broker value has arrived", async () => {
        tradeStateMock.leverage = "20";
        tradeStateMock.remoteLeverage = undefined;
        await render();

        expect(tradeStateMock.leverage).toBe("20");
    });

    it("leaves it alone in paper trading, where the calculator plans again", async () => {
        paperStateMock.enabled = true;
        tradeStateMock.leverage = "20";
        tradeStateMock.remoteLeverage = new Decimal(10);
        await render();

        expect(tradeStateMock.leverage).toBe("20");
    });

    it("still renders the fee column, which no venue capability gates", async () => {
        // Fees are charged whatever the venue's account-settings support, so
        // the row keeps this column even when the exchange chips are absent.
        await render();

        expect(host.querySelector("#fees-input")).not.toBeNull();
    });
});

describe("FEAT-0253 — the fee mirror uses feePreference for the exit-leg assumption", () => {
    /*
     * FEAT-0253, decision 4: the Settings MAKER/TAKER buttons pick which rate
     * a simulated exit pays. The active role is derived from
     * `settingsState.feePreference` (default "taker", decision 3 — the
     * expensive side). The mirror writes the corresponding rate into
     * `tradeState.fees`.
     */
    beforeEach(() => {
        settingsStateMock.feePreference = "taker";
        settingsStateMock.feeRates.bitunix.taker = "0.0600";
        settingsStateMock.feeRates.bitunix.maker = "0.0200";
    });

    it("mirrors the taker rate by default (conservative, decision 3)", async () => {
        // feePreference defaults to "taker" → activeRole = "taker" → mirrors
        // the taker rate (0.0600, the expensive side). The calculator applies
        // this to both entry and exit, erring toward overstating cost.
        tradeStateMock.fees = "0.06";
        await render();

        expect(tradeStateMock.fees).toBe("0.0600");
    });

    it("mirrors the maker rate when feePreference is 'maker'", async () => {
        // User switches the Settings buttons to MAKER → activeRole = "maker"
        // → mirrors the maker rate (0.0200, the cheaper side).
        settingsStateMock.feePreference = "maker";
        tradeStateMock.fees = "0.06";
        await render();

        expect(tradeStateMock.fees).toBe("0.0200");
    });

    it("falls back to DEFAULT_FEES when the active fee field was cleared", async () => {
        // User clears the Taker field in Settings → stores "" → the guard
        // catches it and falls back to 0.06 instead of propagating "".
        (settingsStateMock.feeRates.bitunix as { taker: string }).taker = "";
        tradeStateMock.fees = "0.06";
        await render();

        expect(tradeStateMock.fees).toBe("0.0600");
    });

    it("passes a literal '0' rate through (promo / rebate, not a degenerate input)", async () => {
        // A venue promo or maker rebate can legitimately be 0%. The guard
        // must not treat the string "0" as falsy and fall back to DEFAULT_FEES
        // — only undefined and "" are degenerate.
        (settingsStateMock.feeRates.bitunix as { taker: string }).taker = "0";
        tradeStateMock.fees = "0.06";
        await render();

        expect(tradeStateMock.fees).toBe("0");
    });
});
