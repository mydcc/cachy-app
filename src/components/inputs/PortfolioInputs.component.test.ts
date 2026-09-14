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
vi.mock("../../stores/paperTrading.svelte", () => ({ paperState: { enabled: false } }));

vi.mock("../../services/accountEpoch.svelte", () => ({
    accountEpoch: { current: () => 1, isCurrent: () => true },
}));
vi.mock("../../services/onboardingService", () => ({
    onboardingService: { trackFirstInput: vi.fn() },
}));
vi.mock("../../services/paperAccountFeed", () => ({ paperAccountFeed: () => null }));

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

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    vi.clearAllMocks();
    tradeStateMock.accountSize = "10000";
    tradeStateMock.riskPercentage = "2";
    tradeStateMock.riskAmount = "200";
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

function render(props: Record<string, unknown> = {}) {
    component = mount(PortfolioInputs, {
        target: host,
        props: {
            accountSize: "10000",
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
