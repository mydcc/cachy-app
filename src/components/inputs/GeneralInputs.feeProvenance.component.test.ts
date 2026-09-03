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
 * FEAT-0253 — the panel must never overstate where a fee rate came from.
 *
 * The derivation itself is unit-tested in `src/lib/fees/`. What can only be
 * checked with the component mounted is the part the user actually sees: which
 * badge each leg carries, whether the field is editable, and that the resolved
 * rates reach the `tradeState` fields the sizing maths reads.
 *
 * The claim that matters is negative — a rate the broker never sent is never
 * labelled as the broker's. That is what separates a quote from a guess in a
 * tool that sizes real positions.
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
    remoteFeeSamples: {} as { maker?: number; taker?: number },
    feeMode: "maker_taker" as string,
    entryOrderType: "market" as "market" | "limit" | "trigger",
    entryFees: undefined as unknown,
    exitFees: undefined as unknown,
}));
vi.mock("../../stores/trade.svelte", () => ({ tradeState: tradeStateMock }));

const paperStateMock = vi.hoisted(() => ({ enabled: false }));
vi.mock("../../stores/paperTrading.svelte", () => ({ paperState: paperStateMock }));

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
        _: r((key: string) => lookup(key) ?? key),
        locale: r("en"),
        setLocale: vi.fn(),
    };
});

import GeneralInputs from "./GeneralInputs.svelte";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

function render() {
    component = mount(GeneralInputs, {
        target: host,
        props: { tradeType: "long", leverage: "20" },
    }) as unknown as Record<string, unknown>;
    flushSync();
}

/** The two provenance rows, in render order: entry leg first, then exit. */
function legs(): Array<{ text: string; provenance: string | undefined }> {
    return [...host.querySelectorAll<HTMLElement>(".fee-leg")].map((leg) => ({
        text: leg.textContent?.replace(/\s+/g, " ").trim() ?? "",
        provenance: leg.querySelector<HTMLElement>(".fee-badge")?.dataset.provenance,
    }));
}

function feeInput(): HTMLInputElement {
    return host.querySelector<HTMLInputElement>("#fees-input")!;
}

beforeEach(() => {
    vi.clearAllMocks();
    paperStateMock.enabled = false;
    supportsMock.accountSettings = false;
    settingsStateMock.feePreference = "taker";
    settingsStateMock.feeRates = {
        bitunix: { maker: "0.0200", taker: "0.0600" },
        bitget: { maker: "0.0200", taker: "0.0600" },
    };
    tradeStateMock.leverage = "20";
    tradeStateMock.fees = "0.06";
    tradeStateMock.remoteLeverage = undefined;
    tradeStateMock.remoteMakerFee = undefined;
    tradeStateMock.remoteTakerFee = undefined;
    tradeStateMock.remoteFeeSamples = {};
    tradeStateMock.entryOrderType = "market";
    tradeStateMock.entryFees = undefined;
    tradeStateMock.exitFees = undefined;
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component);
    component = null;
    host.remove();
});

describe("FEAT-0253 — every displayed fee carries its provenance (AC 7)", () => {
    it("labels an untouched venue default 'assumed', not 'from broker'", () => {
        render();
        const [entry, exit] = legs();
        expect(entry.provenance).toBe("assumed");
        expect(exit.provenance).toBe("assumed");
        expect(entry.text).toContain("assumed");
    });

    it("labels a rate derived from the account's fills 'from broker'", () => {
        tradeStateMock.remoteMakerFee = new Decimal("0.015");
        tradeStateMock.remoteTakerFee = new Decimal("0.045");
        tradeStateMock.remoteFeeSamples = { maker: 4, taker: 9 };
        render();

        const [entry, exit] = legs();
        expect(entry.provenance).toBe("broker");
        expect(exit.provenance).toBe("broker");
        expect(exit.text).toContain("0.045");
    });

    it("never claims 'from broker' in paper trading, even with a derived rate present", () => {
        tradeStateMock.remoteMakerFee = new Decimal("0.015");
        tradeStateMock.remoteTakerFee = new Decimal("0.045");
        paperStateMock.enabled = true;
        render();

        for (const leg of legs()) {
            expect(leg.provenance).not.toBe("broker");
        }
    });

    it("labels a Settings rate the user changed 'manual'", () => {
        settingsStateMock.feeRates = {
            ...settingsStateMock.feeRates,
            bitunix: { maker: "0.0200", taker: "0.0350" },
        };
        render();

        const [entry, exit] = legs();
        // Entry is a market order → taker → the changed rate.
        expect(entry.provenance).toBe("manual");
        // Exit follows feePreference "taker" → the same changed rate.
        expect(exit.provenance).toBe("manual");
    });

    it("falls back per role — a maker rate with no maker fills stays 'assumed'", () => {
        // A live account that has only ever taken liquidity: the taker rate is
        // real, the maker one is still the documented default and must say so.
        tradeStateMock.remoteTakerFee = new Decimal("0.045");
        tradeStateMock.remoteFeeSamples = { taker: 3 };
        tradeStateMock.entryOrderType = "limit";
        render();

        const [entry, exit] = legs();
        expect(entry.provenance).toBe("assumed");
        expect(exit.provenance).toBe("broker");
    });
});

describe("FEAT-0253 — the entry leg follows the order type (AC 3)", () => {
    it("charges a market entry the taker rate", () => {
        render();
        expect(legs()[0].text).toContain("0.0600");
        expect((tradeStateMock.entryFees as Decimal)?.toString()).toBe("0.06");
    });

    it("charges a limit entry the maker rate", () => {
        tradeStateMock.entryOrderType = "limit";
        render();
        expect(legs()[0].text).toContain("0.0200");
        expect((tradeStateMock.entryFees as Decimal)?.toString()).toBe("0.02");
    });

    it("charges a trigger entry the taker rate — it fires as a market order", () => {
        tradeStateMock.entryOrderType = "trigger";
        render();
        expect((tradeStateMock.entryFees as Decimal)?.toString()).toBe("0.06");
    });
});

describe("FEAT-0253 — the exit leg is the declared assumption (AC 4)", () => {
    it("assumes taker by default, the expensive side", () => {
        render();
        expect((tradeStateMock.exitFees as Decimal)?.toString()).toBe("0.06");
    });

    it("follows the Settings selector when the user chooses maker", () => {
        settingsStateMock.feePreference = "maker";
        render();
        // The selector changes what a simulated exit *pays*, not merely what
        // is highlighted — so the value the sizing maths reads has to move.
        expect((tradeStateMock.exitFees as Decimal)?.toString()).toBe("0.02");
    });
});

describe("FEAT-0253 — the fee field mirrors a broker rate read-only (AC 9)", () => {
    it("is editable when no rate could be derived", () => {
        render();
        expect(feeInput().readOnly).toBe(false);
    });

    it("is read-only once the broker's own rate is known", () => {
        tradeStateMock.remoteTakerFee = new Decimal("0.045");
        tradeStateMock.remoteFeeSamples = { taker: 5 };
        render();
        expect(feeInput().readOnly).toBe(true);
        expect(feeInput().value).toBe("0.045");
    });

    it("stays editable in paper trading, where there is no broker", () => {
        tradeStateMock.remoteTakerFee = new Decimal("0.045");
        paperStateMock.enabled = true;
        render();
        expect(feeInput().readOnly).toBe(false);
    });

    it("shows a Settings rate as the user typed it, trailing zeros and all", () => {
        render();
        expect(feeInput().value).toBe("0.0600");
    });
});
