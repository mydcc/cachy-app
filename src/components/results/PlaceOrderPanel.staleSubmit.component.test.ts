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
// Assertable: the refusal the trader actually sees is the guard's only
// observable behaviour, so no stale case may pass without checking it.
const showErrorMock = vi.hoisted(() => vi.fn());
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
        leverage: "10",
        accountSize: "10000",
        risk: "1",
    },
    inputs: {
        symbol: "BTCUSDT",
        tradeType: "long",
        entry: "60000",
        stop: "58000",
        leverage: "10",
        accountSize: "10000",
        risk: "1",
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
            return split.inputs.leverage;
        },
        get accountSize() {
            return split.inputs.accountSize;
        },
        get riskPercentage() {
            return split.inputs.risk;
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
vi.mock("../../stores/ui.svelte", () => ({ uiState: { showError: showErrorMock } }));

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
    split.inputs.leverage = "10";
    split.inputs.accountSize = "10000";
    split.inputs.risk = "1";
    split.calculated.symbol = "BTCUSDT";
    split.calculated.tradeType = "long";
    // Symbol and direction too: leaving them out lets "symbol changed" leak into
    // every later case and fail them for the wrong reason — the same trap as the
    // false green, wearing the other face.
    split.inputs.symbol = "BTCUSDT";
    split.inputs.tradeType = "long";
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

async function mountPanel(): Promise<void> {
    component = mount(PlaceOrderPanel, { target: host }) as never;
    await settle();
}

async function submit() {
    await mountPanel();
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

/**
 * A refused submit has two observable effects and a case is only honest if it
 * checks both: nothing was sent, *and* the trader was told why. Asserting only
 * the first passes just as well when the button was disabled, the metadata was
 * missing or the dialog rejected — none of which is this guard.
 */
function expectRefusal() {
    expect(placeEntryGroupMock).not.toHaveBeenCalled();
    expect(showErrorMock).toHaveBeenCalledWith(
        expect.stringContaining("Nothing was sent"),
    );
    // "Nothing was sent" lives in the template, so it holds whether or not
    // `{reason}` was substituted. Pin the substitution itself, or a dropped
    // `values` argument ships a literal `{reason}` to the trader.
    expect(showErrorMock).toHaveBeenCalledWith(
        expect.stringContaining(lookup("orderEntry.notes.staleCalculation")),
    );
}

/** Mounts without submitting — for assertions about what the panel shows. */
async function render(): Promise<string> {
    await mountPanel();
    return host.textContent ?? "";
}

describe("BUG-0648 — the summary says when its figures are no longer current", () => {
    it("labels the figures and keeps showing them", async () => {
        split.inputs.stop = "";

        const text = await render();

        expect(text).toContain(lookup("orderEntry.notes.staleCalculation"));
        // The figures themselves must survive: blanking them would empty the
        // summary on every keystroke while a recalculation is briefly
        // incomplete, and a trader cannot act on a panel that shows nothing.
        expect(text).toContain(lookup("orderEntry.summary.size"));
    });

    it("shows no label while the calculation still matches the inputs", async () => {
        const text = await render();

        expect(text).toContain(lookup("orderEntry.summary.size"));
        expect(text).not.toContain(lookup("orderEntry.notes.staleCalculation"));
    });

    it("labels them for a take-profit leg the trader deleted", async () => {
        split.calculatedTargets = ["65000"];
        split.inputTargets = [];

        expect(await render()).toContain(lookup("orderEntry.notes.staleCalculation"));
    });

    it("labels them for a leverage the trader changed after the calculation", async () => {
        split.inputs.leverage = "20";

        expect(await render()).toContain(lookup("orderEntry.notes.staleCalculation"));
    });

    /*
     * The note must track the predicate, not a hand-picked subset of it. These
     * five each have a submit-side case, so narrowing the note's own condition
     * later — to the stop, say — would otherwise fail nothing here.
     */
    const remainingArms: ReadonlyArray<readonly [string, () => void]> = [
        ["entry price", () => (split.inputs.entry = "61000")],
        ["account size", () => (split.inputs.accountSize = "20000")],
        ["risk percentage", () => (split.inputs.risk = "2")],
        ["symbol", () => (split.inputs.symbol = "ETHUSDT")],
        ["direction", () => (split.inputs.tradeType = "short")],
    ];

    it.each(remainingArms)("labels them for a changed %s", async (_name, change) => {
        change();

        expect(await render()).toContain(lookup("orderEntry.notes.staleCalculation"));
    });
});

describe("BUG-0648 — a submit may not send what the inputs no longer state", () => {
    it("places what the calculation says, and sends exactly that", async () => {
        await submit();

        expect(placeEntryGroupMock).toHaveBeenCalledTimes(1);
        // Not just "something was sent": for a guard whose whole job is "do not
        // send the wrong numbers", the payload is the contract.
        const plan = placeEntryGroupMock.mock.calls[0][0] as Record<string, unknown>;
        expect(plan.symbol).toBe("BTCUSDT");
        expect(plan.tradeType).toBe("long");
        expect((plan.entryPrice as Decimal).toString()).toBe("60000");
        expect((plan.stopLossPrice as Decimal).toString()).toBe("58000");
        expect((plan.qty as Decimal).toString()).toBe("0.5");
        // Not "no error at all": the placement mock returns undefined, which the
        // panel reports as `entryRejected`. What must be absent is the guard's
        // own message — an unrelated refusal must not read as the guard firing.
        expect(showErrorMock).not.toHaveBeenCalledWith(
            expect.stringContaining("Nothing was sent"),
        );
    });

    it("does not place when the stop was cleared but the calculation still holds one", async () => {
        // The live observation: the gate said "clear the stop", the trader
        // cleared it, and the order went out carrying it.
        split.inputs.stop = "";

        await submit();

        expectRefusal();
    });

    it("does not place when the entry price moved and the calculation still holds the old one", async () => {
        split.inputs.entry = "61000";

        await submit();

        expectRefusal();
    });

    it("does not place when the direction changed under a stale calculation", async () => {
        split.inputs.tradeType = "short";

        await submit();

        expectRefusal();
    });

    it("does not place when the symbol changed under a stale calculation", async () => {
        split.inputs.symbol = "ETHUSDT";

        await submit();

        expectRefusal();
    });

    /*
     * The three scalars `positionSize` is a function of. Guarding the stop alone
     * left the same defect one field over: change leverage and the frozen size
     * goes out against the old leverage.
     */
    it("does not place when the leverage changed and the calculation froze the size", async () => {
        split.inputs.leverage = "20";

        await submit();

        expectRefusal();
    });

    it("does not place when the account size changed under a stale calculation", async () => {
        split.inputs.accountSize = "20000";

        await submit();

        expectRefusal();
    });

    it("does not place when a take-profit leg was deleted but the calculation holds it", async () => {
        split.calculatedTargets = ["65000"];
        split.inputTargets = [];

        await submit();

        expectRefusal();
    });

    /*
     * Order is part of what gets sent — `submit()` builds `takeProfits` from
     * `data.targets` in order. Comparing only the count would call a reorder
     * "unchanged", so this case owns the per-index comparison.
     */
    it("does not place when two take-profit legs were reordered", async () => {
        split.calculatedTargets = ["65000", "70000"];
        split.inputTargets = ["70000", "65000"];

        await submit();

        expectRefusal();
    });

    it("places when the legs match, so the guard is not refusing every order", async () => {
        split.calculatedTargets = ["65000", "70000"];
        split.inputTargets = ["65000", "70000"];

        await submit();

        expect(placeEntryGroupMock).toHaveBeenCalledTimes(1);
    });

    /*
     * `TradeTargetSchema.price` carries no numeric refine
     * (`trade.svelte.ts:159`), so a leg price can hold any string. With the raw
     * constructor this throws inside a `$derived` — which does not merely refuse
     * the click, it takes the panel down on every re-evaluation. Refusing is the
     * right outcome; crashing is not available as one.
     */
    it("refuses an unreadable leg price instead of throwing inside the derived", async () => {
        split.calculatedTargets = ["65000"];
        split.inputTargets = ["abc"];

        await submit();

        expectRefusal();
    });

    /*
     * The calculator skips the store write-back below this delta and assigns
     * `currentTradeData` anyway (`calculatorService.ts:429`), so `data` can hold
     * a stop the store never received. Comparing exactly would refuse that order
     * forever with no input that helps — a dead end of its own.
     */
    it("places when the stop differs only by the delta the calculator ignores", async () => {
        split.inputs.stop = "58000.0000005";

        await submit();

        expect(placeEntryGroupMock).toHaveBeenCalledTimes(1);
    });

    it("does not place when the stop differs by more than that delta", async () => {
        split.inputs.stop = "58000.00001";

        await submit();

        expectRefusal();
    });
});

describe("BUG-0651 — a rejected submit reaches a surface a screen reader will speak", () => {
    /*
     * `uiState.showError` is mocked in this file, so these cases assert on the
     * *call* rather than on rendered text. That is the seam the shared error
     * surface provides: it is permanently in the DOM, so the write into it is
     * what makes the announcement. Asserting the call is asserting the region
     * received the message.
     *
     * The banner is checked as well, and not as a substitute. It lives inside
     * `{#if result}`, so on the first submit its node arrives together with its
     * text — the construct live-region guidance calls unreliable. Both surfaces
     * exist on purpose; neither one alone is pinned as sufficient.
     */
    beforeEach(() => {
        placeEntryGroupMock.mockRejectedValue(new Error("signature rejected"));
    });

    afterEach(() => {
        placeEntryGroupMock.mockReset();
    });

    it("writes the refusal into the shared live region", async () => {
        await submit();

        expect(showErrorMock).toHaveBeenCalledWith(
            lookup("orderEntry.errors.entryRejected"),
        );
    });

    it("also renders the assertive banner, for as long as it stays on screen", async () => {
        await submit();

        const alert = host.querySelector<HTMLElement>('[role="alert"]');
        expect(alert).not.toBeNull();
        // The banner is `entryRejected` only when no `errorKey` was set — this
        // catch branch sets none, so `errorText` falls back to it. Assert the
        // string, or a banner that appears with the wrong wording passes.
        expect(alert?.textContent ?? "").toContain(lookup("orderEntry.errors.entryRejected"));
    });

    it("carries the failure detail, which the shared surface cannot", async () => {
        await submit();

        expect(host.textContent ?? "").toContain("signature rejected");
    });
});
