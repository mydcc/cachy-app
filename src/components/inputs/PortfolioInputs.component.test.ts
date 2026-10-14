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

const tradeStateMock = vi.hoisted(() => {
    const state: Record<string, unknown> = {
        accountSize: "10000",
        riskPercentage: "2",
        riskAmount: "200",
    };
    state.update = vi.fn((fn: (s: Record<string, unknown>) => Record<string, unknown>) => {
        Object.assign(state, fn({ ...state }));
    });
    return state;
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
/*
 * The bound account size, behind the accessors `render` hands to the
 * component — the same get/set pair a `bind:accountSize` compiles to.
 *
 * A `SvelteMap`, not a plain variable: a real parent binds a `$state`, so the
 * child's read of the prop is a tracked read and the input catches up when the
 * child writes it back. A plain variable would let the write through and leave
 * the field stale, which is exactly the class of bug under test.
 */
const bound = new SvelteMap<string, string>([["accountSize", "10000"]]);

function boundAccountSize(): string {
    return bound.get("accountSize") ?? "";
}

beforeEach(() => {
    vi.clearAllMocks();
    tradeStateMock.accountSize = "10000";
    tradeStateMock.riskPercentage = "2";
    tradeStateMock.riskAmount = "200";
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
 * BUG-0683 — the field sizes the position, so it has to agree with the account
 * it sizes against. Before this it held the value of the last read while the
 * Market Activity panel reported the current one: two numbers for one
 * simulated account, and the stale one fed the calculator.
 */
describe("BUG-0683 — the Account Balance follows the simulated account in paper mode", () => {
    it("mirrors a paper fill into the field and the bound account size", () => {
        paperState.setBalance(new Decimal("5000"));
        paperState.setEnabled(true);
        render();
        expect(input("account-size").value).toBe("5000");

        paperState.setBalance(new Decimal("7761.04"));
        flushSync();

        expect(boundAccountSize()).toBe("7761.04");
        expect(input("account-size").value).toBe("7761.04");
    });

    it("keeps a number the trader typed instead of overwriting it", () => {
        paperState.setBalance(new Decimal("5000"));
        paperState.setEnabled(true);
        render();
        // The mount mirror put the simulated balance in the field.
        expect(input("account-size").value).toBe("5000");

        typeInto(input("account-size"), "1234");

        paperState.setBalance(new Decimal("7761.04"));
        flushSync();

        // The typed number survives: the account moved and the field did not.
        expect(boundAccountSize()).toBe("5000");
        expect(input("account-size").value).toBe("1234");
        expect(tradeStateMock.accountSize).toBe("1234");
    });

    it("hands the field back to the account when the refresh button reads it again", () => {
        paperState.setBalance(new Decimal("5000"));
        paperState.setEnabled(true);
        render();
        typeInto(input("account-size"), "1234");
        // `typeInto` focuses the field. The caret guard would hold the mirror
        // off for the rest of the test, so hand the focus back first.
        input("account-size").dispatchEvent(new Event("blur"));
        flushSync();

        paperFeedMock.feed = { balance: () => "7761.04" };
        button("button.price-fetch-btn").click();
        flushSync();

        expect(tradeStateMock.accountSize).toBe("7761.04");

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
