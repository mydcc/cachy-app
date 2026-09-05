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
 * checked with the component mounted is the part the user actually sees: the
 * read-only entry-fee line (which switches with the Market/Limit choice),
 * the provenance badge it carries, and that the resolved rates reach the
 * `tradeState` fields the sizing maths reads.
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
    remoteFeeExchange: undefined as string | undefined,
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
        bitunix: { maker: "0.0140", taker: "0.0420" },
        bitget: { maker: "0.0140", taker: "0.0420" },
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

/** The fee column: label row (with provenance chip) + neutral rate line. */
function feeColumn(): HTMLElement {
    return host.querySelector<HTMLElement>(".fee-summary")!.parentElement!;
}

/** The neutral rate line text plus the chip provenance beside the label. */
function summary(): { text: string; provenance: string | undefined } {
    const line = host.querySelector<HTMLElement>(".fee-summary");
    const text = line?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    const provenance =
        feeColumn().querySelector<HTMLElement>(".fee-badge")?.dataset
            .provenance;
    return { text, provenance };
}

function feeSummary(): HTMLElement {
    return host.querySelector<HTMLElement>(".fee-summary")!;
}

beforeEach(() => {
    vi.clearAllMocks();
    paperStateMock.enabled = false;
    supportsMock.accountSettings = false;
    settingsStateMock.apiProvider = "bitunix";
    settingsStateMock.feePreference = "taker";
    settingsStateMock.feeRates = {
        bitunix: { maker: "0.0140", taker: "0.0420" },
        bitget: { maker: "0.0140", taker: "0.0420" },
    };
    tradeStateMock.leverage = "20";
    tradeStateMock.fees = "0.06";
    tradeStateMock.remoteLeverage = undefined;
    tradeStateMock.remoteMakerFee = undefined;
    tradeStateMock.remoteTakerFee = undefined;
    tradeStateMock.remoteFeeSamples = {};
    tradeStateMock.remoteFeeExchange = undefined;
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

describe("FEAT-0253 — the displayed entry fee carries its provenance (AC 7)", () => {
    it("labels an untouched venue default 'assumed', not 'from broker'", () => {
        render();
        expect(summary().provenance).toBe("assumed");
        expect(feeColumn().textContent).toContain("assumed");
    });

    it("labels a rate derived from the account's fills 'from broker'", () => {
        tradeStateMock.remoteFeeExchange = "bitunix";
        tradeStateMock.remoteMakerFee = new Decimal("0.015");
        tradeStateMock.remoteTakerFee = new Decimal("0.045");
        tradeStateMock.remoteFeeSamples = { maker: 4, taker: 9 };
        render();

        expect(summary().provenance).toBe("broker");
        expect(summary().text).toContain("0.045");
    });

    it("never claims 'from broker' in paper trading, even with a derived rate present", () => {
        tradeStateMock.remoteFeeExchange = "bitunix";
        tradeStateMock.remoteMakerFee = new Decimal("0.015");
        tradeStateMock.remoteFeeExchange = "bitunix";
        tradeStateMock.remoteTakerFee = new Decimal("0.045");
        paperStateMock.enabled = true;
        render();

        expect(summary().provenance).not.toBe("broker");
    });

    it("labels a Settings rate the user changed 'manual'", () => {
        settingsStateMock.feeRates = {
            ...settingsStateMock.feeRates,
            bitunix: { maker: "0.0140", taker: "0.0350" },
        };
        render();

        // Entry is a market order → taker → the changed rate.
        expect(summary().provenance).toBe("manual");
        expect(summary().text).toContain("0.0350");
    });

    it("never shows one venue's derived rate as another venue's (cross-venue leak)", () => {
        // Rates are derived from Bitunix fills. With Bitget selected they
        // describe an account Bitget never charged, so they must not appear —
        // least of all under a "from broker" badge.
        tradeStateMock.remoteFeeExchange = "bitunix";
        tradeStateMock.remoteMakerFee = new Decimal("0.015");
        tradeStateMock.remoteTakerFee = new Decimal("0.045");
        settingsStateMock.apiProvider = "bitget";
        render();

        expect(summary().provenance).not.toBe("broker");
        expect(summary().text).not.toContain("0.045");
    });

    it("survives an unparseable stored rate instead of throwing out of a rune", () => {
        // A decimal comma or a stray character must not take the dashboard
        // down: `new Decimal()` throws on them, and this runs inside a
        // `$derived`, so the throw would tear down the component tree.
        for (const bad of ["0,06", "abc", "--1", "1e", " "]) {
            settingsStateMock.feeRates = {
                ...settingsStateMock.feeRates,
                bitunix: { maker: "0.0140", taker: bad },
            };
            expect(() => render()).not.toThrow();
            // Falls back to the theoretical default, and says so.
            expect(summary().text).toContain("0.0420");
            expect(summary().provenance).toBe("assumed");
            if (component) unmount(component);
            component = null;
            host.innerHTML = "";
        }
    });

    it("keeps a deliberate zero rate — a promo or rebate tariff is not junk", () => {
        // `decimal.js` reads "0." as zero, and a zero-percent rate is a real
        // venue offer. Only genuinely unparseable text falls back; a number the
        // user meant is passed through, whatever its formatting.
        settingsStateMock.feeRates = {
            ...settingsStateMock.feeRates,
            bitunix: { maker: "0.0140", taker: "0." },
        };
        render();
        expect(summary().text).toContain("0.");
        expect((tradeStateMock.exitFees as Decimal)?.isZero()).toBe(true);
    });

    it("falls back per role — a maker rate with no maker fills stays 'assumed'", () => {
        // A live account that has only ever taken liquidity: the taker rate is
        // real, the maker one is still the theoretical default. The chip shows
        // the dominant (broker) provenance; the tooltip spells out both legs.
        tradeStateMock.remoteFeeExchange = "bitunix";
        tradeStateMock.remoteTakerFee = new Decimal("0.045");
        tradeStateMock.remoteFeeSamples = { taker: 3 };
        tradeStateMock.entryOrderType = "limit";
        render();

        expect(summary().provenance).toBe("broker");
        expect(summary().text).toContain("0.0140");
        expect(summary().text).toContain("0.045");
        expect(feeSummary().title).toContain("assumed");
        expect(feeSummary().title).toContain("from broker");
    });
});

describe("FEAT-0253 — the entry leg follows the order type (AC 3)", () => {
    it("charges a market entry the taker rate", () => {
        render();
        expect(summary().text).toContain("0.0420");
        expect((tradeStateMock.entryFees as Decimal)?.toString()).toBe("0.042");
    });

    it("charges a limit entry the maker rate", () => {
        tradeStateMock.entryOrderType = "limit";
        render();
        expect(summary().text).toContain("0.0140");
        expect((tradeStateMock.entryFees as Decimal)?.toString()).toBe("0.014");
    });

    it("charges a trigger entry the taker rate — it fires as a market order", () => {
        tradeStateMock.entryOrderType = "trigger";
        render();
        expect((tradeStateMock.entryFees as Decimal)?.toString()).toBe("0.042");
    });
});

describe("FEAT-0253 — the exit leg is the declared assumption (AC 4)", () => {
    it("assumes taker by default, the expensive side", () => {
        render();
        expect((tradeStateMock.exitFees as Decimal)?.toString()).toBe("0.042");
    });

    it("follows the Settings selector when the user chooses maker", () => {
        settingsStateMock.feePreference = "maker";
        render();
        // The selector changes what a simulated exit *pays*, not merely what
        // is highlighted — so the value the sizing maths reads has to move.
        expect((tradeStateMock.exitFees as Decimal)?.toString()).toBe("0.014");
    });
});

describe("FEAT-0253 — the fee panel is read-only, Settings is the only writer", () => {
    it("renders no editable fee input", () => {
        render();
        expect(host.querySelector("#fees-input")).toBeNull();
        expect(host.querySelector("input[name='fees']")).toBeNull();
        expect(feeSummary()).not.toBeNull();
    });

    it("shows both rates neutrally, with no entry/exit words", () => {
        render();
        expect(summary().text).toContain("0.0140");
        expect(summary().text).toContain("0.0420");
        expect(summary().text).not.toContain("Entry");
        expect(summary().text).not.toContain("Exit");
    });

    it("shows no tooltip while the rates are merely assumed", () => {
        render();
        expect(summary().provenance).toBe("assumed");
        expect(feeSummary().getAttribute("title")).toBeNull();
    });

    it("shows the per-role breakdown on hover once a rate is broker-sourced", () => {
        tradeStateMock.remoteFeeExchange = "bitunix";
        tradeStateMock.remoteTakerFee = new Decimal("0.045");
        tradeStateMock.remoteFeeSamples = { taker: 5 };
        render();
        expect(summary().provenance).toBe("broker");
        expect(feeSummary().getAttribute("title")).toContain("0.045");
    });

    it("shows a Settings rate as the user typed it, trailing zeros and all", () => {
        render();
        expect(summary().text).toContain("0.0420");
    });
});
