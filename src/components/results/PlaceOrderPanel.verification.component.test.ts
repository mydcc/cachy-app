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
 * BUG-0560 — live order entry while the private account state is unknown.
 *
 * AC4: the control is disabled while that state is unknown or stale, and says
 * why. AC5: paper mode asks for no credentials, so it must not inherit the
 * block.
 *
 * The panel's own gate is what these cases exercise. The verdict lifecycle
 * behind it is covered in `stores/accountVerification.test.ts`, which is why
 * the store is mocked to a single controllable status here rather than driven
 * through a signed read.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import { Decimal } from "decimal.js";
import en from "../../locales/locales/en.json";
import { accountState } from "../../stores/account.svelte";
import type { TradingPairInfo } from "../../stores/market/types";

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

const resultsMock = vi.hoisted(() => ({ isMarginExceeded: false }));
vi.mock("../../stores/results.svelte", () => ({ resultsState: resultsMock }));

/** The one thing these cases vary: what the panel is told about the account. */
const verificationMock = vi.hoisted(() => ({
    status: "verified" as string,
    // Varies so the panel's message can be told apart by *why* it is blocked:
    // a blank key field and a complete set nobody has read yet are both
    // `unconfigured` and deserve different sentences.
    keys: { key: "k", secret: "s" } as {
        key: string;
        secret: string;
        passphrase?: string;
    },
    exchange: "bitunix" as "bitunix" | "bitget",
    ensureCurrent: vi.fn(async () => undefined),
    startClock: vi.fn(() => () => undefined),
}));
// Whether there is an account at all, which is a different fact from a blank
// field: one has nothing to fill in, the other has something half-filled.
const subjectMock = vi.hoisted(() => ({ present: true }));
vi.mock("../../stores/accountVerification.svelte", async () => {
    const actual = await import("../../stores/accountVerification.svelte");
    return {
        accountVerification: {
            statusFor: () => verificationMock.status,
            startClock: verificationMock.startClock,
        },
        subjectFor: () =>
            subjectMock.present
                ? {
                      id: "acct-1",
                      exchange: verificationMock.exchange,
                      keys: verificationMock.keys,
                  }
                : null,
        // The real predicate, so the panel's message is exercised against the
        // rule and not against a stub that could agree with anything.
        credentialPresence: actual.credentialPresence,
        VERIFICATION_INPUT_DEBOUNCE_MS: actual.VERIFICATION_INPUT_DEBOUNCE_MS,
        ensureCurrent: verificationMock.ensureCurrent,
    };
});

const mockTradeData = vi.hoisted(() => ({
    symbol: "BTCUSDT",
    tradeType: "long",
    positionSize: null as Decimal | null,
    entryPrice: null as Decimal | null,
    stopLossPrice: null as Decimal | null,
    targets: [] as Array<{ price: Decimal; percentage: number }>,
    accountSize: null as Decimal | null,
    riskPercentage: null as Decimal | null,
    leverage: null as Decimal | null,
    requiredMargin: null as Decimal | null,
    remoteAccountStateAt: Date.now(),
    remoteMarginMode: "ISOLATION",
}));

vi.mock("../../stores/trade.svelte", () => ({
    tradeState: {
        get symbol() {
            return mockTradeData.symbol;
        },
        get leverage() {
            return mockTradeData.leverage?.toString() ?? "";
        },
        get remoteMarginMode() {
            return mockTradeData.remoteMarginMode;
        },
        get currentTradeData() {
            return {
                symbol: mockTradeData.symbol,
                tradeType: mockTradeData.tradeType,
                positionSize: mockTradeData.positionSize,
                entryPrice: mockTradeData.entryPrice,
                stopLossPrice: mockTradeData.stopLossPrice,
                targets: mockTradeData.targets,
                accountSize: mockTradeData.accountSize,
                riskPercentage: mockTradeData.riskPercentage,
                leverage: mockTradeData.leverage,
                requiredMargin: mockTradeData.requiredMargin,
            };
        },
        get remoteAccountStateAt() {
            return mockTradeData.remoteAccountStateAt;
        },
        set entryOrderType(_value: string) {
            // The panel mirrors its entry type into the store; irrelevant here.
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
    META_FETCH_RETRY_MS: 30_000,
}));

vi.mock("../../services/exchange", () => ({
    activeExchange: () => ({
        account: {
            fetchTradingPairInfo: vi.fn().mockResolvedValue(undefined),
            fetchLeverageMarginMode: vi.fn().mockResolvedValue(undefined),
        },
    }),
}));

const showMock = vi.hoisted(() => vi.fn());
vi.mock("../../stores/modal.svelte", () => ({ modalState: { show: showMock } }));

const placeEntryGroupMock = vi.hoisted(() => vi.fn());
vi.mock("../../services/orderPlacementService", () => ({
    orderPlacementService: { placeEntryGroup: placeEntryGroupMock },
    narrowTradeType: (tradeType: string) => {
        const normalized = tradeType.toLowerCase();
        if (normalized === "long" || normalized === "short") return normalized;
        return null;
    },
}));

vi.mock("../../services/toastService.svelte", () => ({
    toastService: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("../../stores/ui.svelte", () => ({
    uiState: { showError: vi.fn() },
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
import { readFileSync } from "node:fs";
// From the mocked module, so the test and the component agree on the window.
import { VERIFICATION_INPUT_DEBOUNCE_MS } from "../../stores/accountVerification.svelte";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

const TRADABLE: TradingPairInfo = {
    symbol: "BTCUSDT",
    basePrecision: 4,
    quotePrecision: 2,
    minTradeVolume: new Decimal("0.001"),
    maxLimitOrderVolume: new Decimal("100"),
    maxMarketOrderVolume: new Decimal("50"),
    symbolStatus: "OPEN",
    isApiSupported: true,
};

beforeEach(() => {
    vi.clearAllMocks();
    settings.apiProvider = "bitunix";
    settings.autoUpdatePriceInput = true;
    resultsMock.isMarginExceeded = false;
    paperStateMock.enabled = false;
    verificationMock.status = "verified";
    verificationMock.keys = { key: "k", secret: "s" };
    verificationMock.exchange = "bitunix";
    subjectMock.present = true;
    mockSymbolMetaStore.symbolMeta = { BTCUSDT: { ...TRADABLE } };
    mockTradeData.positionSize = new Decimal("0.02");
    mockTradeData.entryPrice = new Decimal("50000");
    mockTradeData.stopLossPrice = new Decimal("49000");
    mockTradeData.targets = [{ price: new Decimal("52000"), percentage: 100 }];
    mockTradeData.accountSize = new Decimal("1000");
    mockTradeData.riskPercentage = new Decimal("1");
    mockTradeData.leverage = new Decimal("10");
    // 0.02 × 50000 / 10 = 100 of required margin.
    mockTradeData.requiredMargin = new Decimal("100");
    mockTradeData.remoteAccountStateAt = Date.now();
    // A funded wallet, so the only thing under test is the account verdict.
    accountState.hydrateBalance({ available: "500", margin: "0", frozen: "0" }, "live");
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component);
    component = null;
    host.remove();
    accountState.reset();
});

async function settle(rounds = 6) {
    for (let i = 0; i < rounds; i++) {
        flushSync();
        await Promise.resolve();
    }
    flushSync();
}

function submitButton(): HTMLButtonElement {
    const button = host.querySelector<HTMLButtonElement>("button.submit-btn");
    if (!button) throw new Error("submit button not rendered");
    return button;
}

describe("BUG-0560 — live entry waits for a private-account verdict", () => {
    it("keeps submit usable once the account is verified", async () => {
        component = mount(PlaceOrderPanel, { target: host }) as never;
        await settle();

        expect(submitButton().disabled).toBe(false);
    });

    it("disables submit when no verdict has ever been reached", async () => {
        // `unconfigured` covers "no credential at all" and "a complete key
        // nobody has read yet", and both are unknown. This used to wave the
        // first through on the argument that a missing credential cannot
        // coexist with a live balance — it can, because `accountState` keeps
        // its balance hydrated after the key fields are cleared.
        verificationMock.status = "unconfigured";
        component = mount(PlaceOrderPanel, { target: host }) as never;
        await settle();

        expect(submitButton().disabled).toBe(true);
    });

    it("names the empty field instead of claiming a check is running", async () => {
        // A field is empty: there is genuinely nothing to verify, and the message
        // must be about the field rather than about a check.
        verificationMock.status = "unconfigured";
        verificationMock.keys = { key: "", secret: "" };
        component = mount(PlaceOrderPanel, { target: host }) as never;
        await settle();

        expect(host.textContent).toContain(
            lookup("orderEntry.errors.accountCredentialsIncomplete"),
        );
        expect(host.textContent).not.toContain(lookup("orderEntry.errors.accountUnverified"));
        // A Bitunix trader has never seen a passphrase field; naming one would be
        // a worse wrong answer than the one it replaced.
        expect(host.textContent).not.toContain(
            lookup("orderEntry.errors.accountPassphraseMissing"),
        );
    });

    it("says no credentials at all when there is no account for the venue", async () => {
        // `subjectFor` returns null here, which is a different fact from a blank
        // field: there is nothing to fill in.
        verificationMock.status = "unconfigured";
        subjectMock.present = false;
        component = mount(PlaceOrderPanel, { target: host }) as never;
        await settle();

        expect(host.textContent).toContain(
            lookup("orderEntry.errors.accountCredentialsMissing"),
        );
    });

    it("names the missing passphrase instead of claiming there are no credentials", async () => {
        // A Bitget account with a key and a secret and no passphrase has
        // credentials. Told "no API credentials configured", a trader deletes
        // the two fields that were fine. The panel reads its venue from
        // settings, so that is what has to say bitget — not the subject.
        verificationMock.status = "unconfigured";
        settings.apiProvider = "bitget";
        verificationMock.exchange = "bitget";
        verificationMock.keys = { key: "k", secret: "s" };
        component = mount(PlaceOrderPanel, { target: host }) as never;
        await settle();

        expect(host.textContent).toContain(
            lookup("orderEntry.errors.accountPassphraseMissing"),
        );
        expect(host.textContent).not.toContain(
            lookup("orderEntry.errors.accountCredentialsMissing"),
        );
    });

    it("does not claim a complete key is missing just because nobody read it yet", async () => {
        // The common case, and the one a status-derived sentence gets wrong: a
        // complete credential set that has no verdict yet — the state before a
        // first read, and the state of every account for a moment after a
        // session rotation. Saying "no API credentials configured" here would
        // point a trader with a working key away from the problem.
        verificationMock.status = "unconfigured";
        verificationMock.keys = { key: "k", secret: "s" };
        component = mount(PlaceOrderPanel, { target: host }) as never;
        await settle();

        expect(submitButton().disabled).toBe(true);
        expect(host.textContent).toContain(lookup("orderEntry.errors.accountUnverified"));
        expect(host.textContent).not.toContain(
            lookup("orderEntry.errors.accountCredentialsMissing"),
        );
    });

    it("disables submit while the private account is still being checked", async () => {
        verificationMock.status = "verifying";
        component = mount(PlaceOrderPanel, { target: host }) as never;
        await settle();

        expect(submitButton().disabled).toBe(true);
    });

    it("disables submit once the verdict has gone stale", async () => {
        verificationMock.status = "stale";
        component = mount(PlaceOrderPanel, { target: host }) as never;
        await settle();

        expect(submitButton().disabled).toBe(true);
    });

    it("says why the control is disabled", async () => {
        verificationMock.status = "verifying";
        component = mount(PlaceOrderPanel, { target: host }) as never;
        await settle();

        // The panel is a hint, the gate is the authority — but a disabled
        // control with no explanation is the same dead end as a bug.
        expect(host.textContent).toContain(lookup("orderEntry.errors.accountUnverified"));
    });

    it("does not place through a disabled control", async () => {
        verificationMock.status = "stale";
        component = mount(PlaceOrderPanel, { target: host }) as never;
        await settle();

        // A disabled button never dispatches `click` at all, so clicking it
        // proves nothing about this panel — the attribute is the browser's
        // promise, not the panel's guard. The guard is the `ready` check inside
        // `submit`, so the attribute is stripped to reach it: this is the case
        // where something *else* disabled the control and the panel still has to
        // refuse.
        const button = submitButton();
        expect(button.disabled).toBe(true);
        button.disabled = false;
        button.click();
        await settle();
        expect(placeEntryGroupMock).not.toHaveBeenCalled();
    });

    it("holds the store's clock, and lets it go on unmount", async () => {
        // Without a live clock the derived freshness comparison has no reactive
        // input, and a green dot would outlive its window for as long as the tab
        // stayed open. This panel is mounted unconditionally, which is what makes
        // it the one place that can own the tick.
        //
        // The teardown is the half worth asserting. The tick is an interval:
        // an effect that started one and never cleared it would leave the
        // store's clock running for the rest of the session, and every later
        // mount would add another.
        const stopClock = vi.fn();
        verificationMock.startClock.mockReturnValue(stopClock);
        component = mount(PlaceOrderPanel, { target: host }) as never;
        await settle();

        expect(verificationMock.startClock).toHaveBeenCalled();
        expect(stopClock).not.toHaveBeenCalled();

        unmount(component as never);
        component = null;
        expect(stopClock).toHaveBeenCalledTimes(1);
    });

    it("waits for typing to settle before asking, so a burst is one read", async () => {
        // The credential fields are text inputs and this effect watches all
        // three, so every keystroke re-runs it. A read is a signed request, and
        // the store cannot tell a rotated key from a key mid-word — so the
        // debounce lives here, where the keystrokes are.
        vi.useFakeTimers();
        try {
            component = mount(PlaceOrderPanel, { target: host }) as never;
            flushSync();
            expect(verificationMock.ensureCurrent).not.toHaveBeenCalled();

            vi.advanceTimersByTime(VERIFICATION_INPUT_DEBOUNCE_MS + 10);
            await Promise.resolve();
            expect(verificationMock.ensureCurrent).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it("watches every credential field, because the fingerprint hashes all three", () => {
        // A source scan, deliberately. The claim is about which fields the effect
        // *depends on*, and that cannot be exercised through a mock: `subjectFor`
        // here returns a plain object, which no edit can make reactive, so the
        // effect would not re-run with or without these reads. What is testable is
        // the dependency list itself — and the panel missing it is exactly the
        // bug it was: a passphrase-only edit on a Bitget account made the verdict
        // stale, re-asked nothing, and left live entry blocked behind a
        // "still being checked" that was checking nothing.
        //
        // Both readers, because both are the only thing that re-asks.
        const panel = readFileSync("src/components/results/PlaceOrderPanel.svelte", "utf8");
        expect(panel).toMatch(/void verificationSubject\?\.keys\.key;/);
        expect(panel).toMatch(/void verificationSubject\?\.keys\.secret;/);
        expect(panel).toMatch(/void verificationSubject\?\.keys\.passphrase;/);

        const sidebar = readFileSync("src/components/shared/PositionsSidebar.svelte", "utf8");
        // The sidebar's condition is its dependency list as well, so it has to go
        // through the helper that reads the passphrase rather than a hand-rolled
        // key-and-secret test.
        expect(sidebar).toMatch(/if \(keys && hasCompleteCredentials\(keys, provider\)\) \{/);
    });

    it("asks for a verdict while the panel is on screen, once typing settles", async () => {
        // Fake timers before the mount: the effect schedules its debounce as it
        // runs, and a real timer scheduled first would not be the one advanced.
        // The debounce is this panel's half of the per-keystroke bound — the
        // store cannot tell a rotated key from a key mid-word, because a read is
        // never issued for a half-empty set at all.
        vi.useFakeTimers();
        try {
            component = mount(PlaceOrderPanel, { target: host }) as never;
            flushSync();
            expect(verificationMock.ensureCurrent).not.toHaveBeenCalled();

            vi.advanceTimersByTime(VERIFICATION_INPUT_DEBOUNCE_MS + 10);
            await Promise.resolve();
            expect(verificationMock.ensureCurrent).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it("leaves a refused credential to the gate, which names the venue's reason", async () => {
        // Not this panel's call: the gate refuses an order the exchange will
        // not accept, with a far more specific message than "unverified".
        verificationMock.status = "rejected";
        component = mount(PlaceOrderPanel, { target: host }) as never;
        await settle();

        expect(submitButton().disabled).toBe(false);
        expect(host.textContent).not.toContain(lookup("orderEntry.errors.accountUnverified"));
    });

    it("needs no credentials in paper mode", async () => {
        // AC5: the simulated book is local, so an unknown live account must not
        // stand between a paper trader and their order.
        paperStateMock.enabled = true;
        verificationMock.status = "unconfigured";
        component = mount(PlaceOrderPanel, { target: host }) as never;
        await settle();

        expect(submitButton().disabled).toBe(false);
        expect(host.textContent).not.toContain(lookup("orderEntry.errors.accountUnverified"));
    });

    it("does not ask for a verification read in paper mode", async () => {
        paperStateMock.enabled = true;
        component = mount(PlaceOrderPanel, { target: host }) as never;
        await settle();

        expect(verificationMock.ensureCurrent).not.toHaveBeenCalled();
    });
});
