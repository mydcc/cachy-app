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
 * FEAT-0346 — these three fields are the denominator of every position size.
 * The tests pin the two rules the component enforces in the browser: user
 * input is kept visible while the store gets a validated value, and the risk
 * percentage can never exceed 100 however it is typed.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import { SvelteMap } from "svelte/reactivity";
import { Decimal } from "decimal.js";

/*
 * One cell for the account size. In the app `bind:accountSize={
 * tradeState.accountSize}` makes the store and the prop the same value; two
 * cells here would let the field disagree with the store while every assertion
 * stayed green, which is the shape of the defect under test rather than a
 * detail of the harness.
 *
 * A `SvelteMap`, not a variable: a real parent binds a `$state`, so the child's
 * read of the prop is a tracked read and the input catches up when the child
 * writes it back.
 */
const bound = new SvelteMap<string, string>([["accountSize", "10000"]]);
const riskBound = new SvelteMap<string, string>([["riskAmount", "200"]]);

type StoreWrite = (fn: (state: Record<string, unknown>) => Record<string, unknown>) => void;

const tradeStateMock = vi.hoisted(() => {
    const state: Record<string, unknown> = {
        riskPercentage: "2",
        isRiskAmountLocked: false,
        isPositionSizeLocked: false,
        lockedPositionSize: null,
        entryPrice: "50000",
        stopLossPrice: "49500",
    };
    Object.defineProperty(state, "riskAmount", {
        enumerable: true,
        get: () => riskBound.get("riskAmount") ?? "",
        set: (value: string) => {
            riskBound.set("riskAmount", value);
        },
    });
    Object.defineProperty(state, "accountSize", {
        enumerable: true,
        get: () => bound.get("accountSize") ?? "",
        set: (value: string) => {
            bound.set("accountSize", value);
        },
    });
    const update: StoreWrite = (fn) => {
        Object.assign(state, fn({ ...state }));
    };
    state.update = vi.fn(update);
    return state as {
        accountSize: string;
        riskPercentage: string;
        riskAmount: string;
        isRiskAmountLocked: boolean;
        isPositionSizeLocked: boolean;
        lockedPositionSize: Decimal | null;
        entryPrice: string;
        stopLossPrice: string;
        update: StoreWrite;
    };
});
vi.mock("../../stores/trade.svelte", () => ({ tradeState: tradeStateMock }));

vi.mock("../../stores/market.svelte", () => ({
    marketState: { connectionStatus: "connected", data: {}, symbolMeta: {} },
}));
vi.mock("../../stores/settings.svelte", () => ({
    settingsState: {
        accounts: {},
        activeAccountId: "a1",
        apiProvider: "bitunix",
        autoFetchBalance: false,
    },
}));
vi.mock("../../stores/settings/accounts", () => ({
    keysForActiveAccount: () => ({ key: "k", secret: "s" }),
}));
vi.mock("../../stores/ui.svelte", () => ({
    uiState: { showFeedback: vi.fn(), showError: vi.fn() },
}));
// BUG-0683 — `paperState` is deliberately NOT mocked: the field follows the
// simulated balance, and observing that means observing a real `$state`
// signal. A plain object would never re-run the effect.

vi.mock("../../services/accountEpoch.svelte", () => ({
    accountEpoch: { current: () => 1, isCurrent: () => true },
}));
vi.mock("../../services/onboardingService", () => ({
    onboardingService: { trackFirstInput: vi.fn() },
}));
const paperFeedMock = vi.hoisted(() => ({
    feed: null as null | { balance: () => string },
}));
vi.mock("../../services/paperAccountFeed", () => ({
    paperAccountFeed: () => paperFeedMock.feed,
}));

vi.mock("../../utils/inputUtils", () => ({ numberInput: () => ({ destroy() {} }) }));
vi.mock("../../lib/actions/inputEnhancements", () => ({
    enhancedInput: () => ({ destroy() {} }),
}));
vi.mock("../../utils/safeJson", () => ({
    safeJsonParse: (text: string) => JSON.parse(text),
}));
vi.mock("../../utils/errorUtils", () => ({ mapApiErrorToLabel: () => null }));
vi.mock("../../lib/appAuth", () => ({ appFetch: vi.fn() }));
vi.mock("../../locales/i18n", async () => {
    const { readable: r } = await import("svelte/store");
    return { _: r((key: string) => key), locale: r("en"), setLocale: vi.fn() };
});

import PortfolioInputs from "./PortfolioInputs.svelte";
import { paperState } from "../../stores/paperTrading.svelte";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

function boundAccountSize(): string {
    return bound.get("accountSize") ?? "";
}

beforeEach(() => {
    vi.clearAllMocks();
    tradeStateMock.accountSize = "10000";
    tradeStateMock.riskPercentage = "2";
    tradeStateMock.riskAmount = "200";
    tradeStateMock.isRiskAmountLocked = false;
    tradeStateMock.isPositionSizeLocked = false;
    tradeStateMock.lockedPositionSize = null;
    tradeStateMock.entryPrice = "50000";
    tradeStateMock.stopLossPrice = "49500";
    paperFeedMock.feed = null;
    paperState.setEnabled(false);
    paperState.setBalance(new Decimal("0"));
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

function render(props: Record<string, unknown> = {}) {
    bound.set("accountSize", "10000");
    component = mount(PortfolioInputs, {
        target: host,
        props: {
            get accountSize() {
                return boundAccountSize();
            },
            set accountSize(value: string) {
                bound.set("accountSize", value);
            },
            riskPercentage: "2",
            riskAmount: "200",
            isRiskAmountLocked: false,
            isPositionSizeLocked: false,
            ...props,
        },
    }) as never;
    flushSync();
}

function input(id: string): HTMLInputElement {
    const el = host.querySelector<HTMLInputElement>(`#${id}`);
    if (!el) throw new Error(`#${id} not rendered`);
    return el;
}

// A selector that matches nothing must fail here rather than turn a click into
// a no-op the assertions below cannot notice.
function button(selector: string): HTMLButtonElement {
    const el = host.querySelector<HTMLButtonElement>(selector);
    if (!el) throw new Error(`${selector} not rendered`);
    return el;
}

function typeInto(el: HTMLInputElement, value: string) {
    el.dispatchEvent(new Event("focus"));
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
}

// `typeInto` leaves the field focused, and the caret guard would hold the
// mirror off for the rest of a case. Handing focus back is its own step, so a
// case that means to check the caret guard can skip it.
function blur(el: HTMLInputElement) {
    el.dispatchEvent(new Event("blur"));
    flushSync();
}

describe("FEAT-0346 — PortfolioInputs keeps user input and store value apart", () => {
    it("renders the current account, risk percentage and risk amount", () => {
        render();

        expect(input("account-size").value).toBe("10000");
        expect(input("risk-percentage").value).toBe("2");
        expect(input("risk-amount").value).toBe("200");
    });

    it("clamps a risk percentage above 100 for the store but keeps the typed text", () => {
        render();

        typeInto(input("risk-percentage"), "150");

        expect(tradeStateMock.riskPercentage).toBe("100");
        expect(input("risk-percentage").value).toBe("150");
    });

    it("ignores a non-numeric account size instead of writing NaN to the store", () => {
        render();

        typeInto(input("account-size"), "12a3");

        expect(tradeStateMock.accountSize).toBe("10000");
    });

    it("routes the risk-amount lock through its callback", () => {
        const ontoggleriskamountlock = vi.fn();
        render({ ontoggleriskamountlock });

        host.querySelector<HTMLButtonElement>("button.btn-lock-icon")?.click();

        expect(ontoggleriskamountlock).toHaveBeenCalledTimes(1);
    });
});

/*
 * The risk lens (`lib/risk.ts`): only the edited side is stored, the other
 * side is derived by the same pure function the calculation sizes against.
 * These cases drive the locks the app sets and assert the fields show the
 * derived side — not a value the calculation wrote back, because nothing
 * writes it back anymore.
 */
describe("risk lens — locked modes show the derived side", () => {
    it("derives the percentage from the locked amount", () => {
        tradeStateMock.riskPercentage = "1"; // stale by design, never shown
        tradeStateMock.riskAmount = "250";
        tradeStateMock.isRiskAmountLocked = true;
        render({ riskPercentage: "1", riskAmount: "250", isRiskAmountLocked: true });

        expect(input("risk-percentage").value).toBe("2.5");
        expect(input("risk-amount").value).toBe("250");
    });

    it("follows the locked amount while it is typed", () => {
        tradeStateMock.riskPercentage = "1";
        tradeStateMock.riskAmount = "250";
        tradeStateMock.isRiskAmountLocked = true;
        render({ riskPercentage: "1", riskAmount: "250", isRiskAmountLocked: true });

        // What `handleRiskAmountInput` does: the typed amount lands in the
        // store, and the derived percentage follows on the same flush.
        tradeStateMock.riskAmount = "300";
        flushSync();

        expect(input("risk-percentage").value).toBe("3");
    });

    it("derives both sides from the locked position size", () => {
        tradeStateMock.riskPercentage = "9.99"; // stale by design, never shown
        tradeStateMock.riskAmount = "9.99";
        tradeStateMock.isPositionSizeLocked = true;
        tradeStateMock.lockedPositionSize = new Decimal("0.2");
        render({
            riskPercentage: "9.99",
            riskAmount: "9.99",
            isPositionSizeLocked: true,
        });

        // |50000 - 49500| * 0.2 = 100 risk amount, 1% of the 10000 account.
        expect(input("risk-percentage").value).toBe("1");
        expect(input("risk-amount").value).toBe("100");
    });
});

/*
 * BUG-0683 — the field sizes the position, so it has to agree with the account
 * it sizes against. Before this it held the value of the last read while the
 * Market Activity panel reported the current one: two numbers for one
 * simulated account, and the stale one fed the calculator.
 */
describe("BUG-0683 — the Account Balance follows the simulated account in paper mode", () => {
    it("mirrors a paper fill into the field and the store", () => {
        paperState.setBalance(new Decimal("5000"));
        paperState.setEnabled(true);
        render();
        expect(input("account-size").value).toBe("5000");

        paperState.setBalance(new Decimal("7761.04"));
        flushSync();

        expect(boundAccountSize()).toBe("7761.04");
        expect(tradeStateMock.accountSize).toBe("7761.04");
        expect(input("account-size").value).toBe("7761.04");
    });

    it("keeps a number the trader typed instead of overwriting it", () => {
        paperState.setBalance(new Decimal("5000"));
        paperState.setEnabled(true);
        render();
        // The mirror put the simulated balance in the field on mount.
        expect(input("account-size").value).toBe("5000");

        typeInto(input("account-size"), "1234");
        // Blurred on purpose. With the caret still in the field the caret guard
        // alone would hold the mirror off, and this case would then pass with
        // the typed value unprotected ever.
        blur(input("account-size"));
        expect(tradeStateMock.accountSize).toBe("1234");

        paperState.setBalance(new Decimal("7761.04"));
        flushSync();

        // The typed number survives: the account moved and the field did not.
        expect(boundAccountSize()).toBe("1234");
        expect(input("account-size").value).toBe("1234");
    });

    it("hands the field back to the account when the refresh button reads it again", () => {
        paperState.setBalance(new Decimal("5000"));
        paperState.setEnabled(true);
        render();
        typeInto(input("account-size"), "1234");
        blur(input("account-size"));
        expect(boundAccountSize()).toBe("1234");

        // The account moves behind the trader's number, which is what the
        // override is for: the field does not follow.
        paperState.setBalance(new Decimal("6000"));
        flushSync();
        expect(input("account-size").value).toBe("1234");

        // The seam reads the book, exactly as `paperAccountFeed` does.
        paperFeedMock.feed = { balance: () => paperState.balance.toString() };
        button("button.price-fetch-btn").click();
        flushSync();

        // Field and store agree on what the read returned.
        expect(boundAccountSize()).toBe("6000");
        expect(tradeStateMock.accountSize).toBe("6000");
        expect(input("account-size").value).toBe("6000");

        // …and the override is released, so the next fill is mirrored again.
        paperState.setBalance(new Decimal("7000"));
        flushSync();

        expect(boundAccountSize()).toBe("7000");
        expect(input("account-size").value).toBe("7000");
    });

    it("hands the field back on an explicit read when the typed number equals the balance", () => {
        paperState.setBalance(new Decimal("5000"));
        paperState.setEnabled(true);
        render();

        // The trader's own number happens to be the balance, so the value
        // comparison alone cannot tell the override from an untouched field.
        // Only the explicit read can release this one.
        typeInto(input("account-size"), "5000");
        blur(input("account-size"));
        expect(boundAccountSize()).toBe("5000");

        paperFeedMock.feed = { balance: () => paperState.balance.toString() };
        button("button.price-fetch-btn").click();
        flushSync();

        paperState.setBalance(new Decimal("7000"));
        flushSync();

        expect(boundAccountSize()).toBe("7000");
        expect(input("account-size").value).toBe("7000");
    });

    it("follows the account again after a preset or a Reset writes the field", () => {
        paperState.setBalance(new Decimal("5000"));
        paperState.setEnabled(true);
        render();
        typeInto(input("account-size"), "1234");
        blur(input("account-size"));

        // What `app.loadPreset` and `tradeState.resetInputs` both do: a new
        // account size the trader did not type. A latch on "the trader typed"
        // stayed set here and the mirror never resumed — the reported symptom
        // again, one button away.
        tradeStateMock.update((s) => ({ ...s, accountSize: "8000" }));
        flushSync();

        // The preset's own number is not what this field sizes against while
        // paper mode is on — the simulated account is — and the mirror is
        // running again.
        expect(input("account-size").value).toBe("5000");

        paperState.setBalance(new Decimal("7000"));
        flushSync();

        expect(boundAccountSize()).toBe("7000");
        expect(input("account-size").value).toBe("7000");
    });

    it("does not move the field while it is focused", () => {
        paperState.setBalance(new Decimal("5000"));
        paperState.setEnabled(true);
        render();

        input("account-size").dispatchEvent(new Event("focus"));
        flushSync();

        paperState.setBalance(new Decimal("7761.04"));
        flushSync();

        expect(boundAccountSize()).toBe("5000");
        expect(input("account-size").value).toBe("5000");
    });

    it("catches up on blur after a fill it skipped while focused", () => {
        paperState.setBalance(new Decimal("5000"));
        paperState.setEnabled(true);
        render();

        input("account-size").dispatchEvent(new Event("focus"));
        flushSync();
        paperState.setBalance(new Decimal("7761.04"));
        flushSync();
        expect(input("account-size").value).toBe("5000");

        blur(input("account-size"));

        expect(boundAccountSize()).toBe("7761.04");
        expect(input("account-size").value).toBe("7761.04");
    });

    it("writes nothing to the field while paper mode is off", () => {
        render();

        paperState.setBalance(new Decimal("7761.04"));
        flushSync();

        expect(boundAccountSize()).toBe("10000");
        expect(input("account-size").value).toBe("10000");
    });

    it("mirrors on enabling paper mode, with no refresh click", () => {
        paperState.setBalance(new Decimal("7000"));
        render();

        paperState.setEnabled(true);
        flushSync();

        expect(boundAccountSize()).toBe("7000");
        expect(input("account-size").value).toBe("7000");
    });
});
