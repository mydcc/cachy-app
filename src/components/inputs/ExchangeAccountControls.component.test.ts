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
 * FEAT-0068 / FEAT-0328 — the preconditions and the confirmation, as the
 * trade panel enforces them.
 *
 * The claim being tested each time is the absence of a request, not the
 * presence of a message. The message is the courtesy; the unsent request is
 * the guarantee.
 *
 * Two groups are load-bearing:
 *
 * 1. "nothing travels without a confirmation" — every write here changes a
 *    live account, so picking an option must move a draft and nothing more.
 *    An earlier revision fired on the click itself; these tests exist so that
 *    can never come back.
 *
 * 2. "the three writes stay gated differently" — the exchange documents a
 *    different precondition for each (docs/bitunix-api/02_account.md), and
 *    leverage has none at all. A refactor that gave the shared dialog one gate
 *    would disable leverage on an open position, exactly the case Bitunix
 *    allows and traders rely on.
 *
 * Not covered here: a WebSocket push that moves the exchange's value while a
 * dialog is open must not overwrite the draft. The store mocks are plain
 * objects, so nothing is reactive after mount and such a test would pass for
 * the wrong reason. The seeding contract it rests on is pinned instead.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { confirmationPolicyStore } from "../../stores/confirmationPolicy.svelte";
import { mount, unmount, flushSync } from "svelte";
import { Decimal } from "decimal.js";
import en from "../../locales/locales/en.json";

vi.mock("../../services/logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

/*
 * `ModalFrame` renders nothing where it is declared — it hands its `children`
 * snippet to the WindowManager and `WindowContainer` renders it elsewhere.
 * The passthrough helper renders them inline so the dialogs can be queried.
 */
vi.mock("../shared/ModalFrame.svelte", async () => ({
    default: (await import("../../tests/helpers/PassthroughModalFrame.svelte")).default,
}));

const settings = vi.hoisted(() => ({ apiProvider: "bitunix" as string }));
vi.mock("../../stores/settings.svelte", () => ({ settingsState: settings }));

const paperStateMock = vi.hoisted(() => ({ enabled: false }));
vi.mock("../../stores/paperTrading.svelte", () => ({ paperState: paperStateMock }));

const tradeStateMock = vi.hoisted(() => ({
    symbol: "BTCUSDT",
    // FEAT-0328 decoupled this from the exchange write. It stays in the mock
    // so a test can prove the chip no longer reads it when a broker value
    // exists — and does write it when one does not.
    leverage: "20" as string | null,
    remoteLeverage: undefined as unknown,
    remoteMarginMode: "ISOLATION" as string | undefined,
    remoteAccountStateAt: undefined as number | undefined,
}));
vi.mock("../../stores/trade.svelte", () => ({ tradeState: tradeStateMock }));

const marketStateMock = vi.hoisted(() => ({
    symbolMeta: {} as Record<string, unknown>,
}));
vi.mock("../../stores/market.svelte", () => ({ marketState: marketStateMock }));

/*
 * Positions carry `Decimal`, not strings — that is the store's own shape
 * (`stores/account.svelte.ts`). An earlier revision of this file mocked them
 * as strings and so verified against a shape production never produces.
 */
const accountStateMock = vi.hoisted(() => ({
    positions: [] as Array<{
        symbol: string;
        entryPrice?: unknown;
        liquidationPrice?: unknown;
        leverage?: unknown;
        marginMode?: string;
    }>,
    openOrders: [] as Array<{ symbol: string; marginMode?: string; positionMode?: string }>,
    positionMode: "ONE_WAY" as string | undefined,
    positionModeAt: undefined as number | undefined,
    positionModeVerifying: false,
    marginModeVerifying: false,
    requestSync: vi.fn(),
}));
vi.mock("../../stores/account.svelte", () => ({ accountState: accountStateMock }));

const modalMock = vi.hoisted(() => ({ show: vi.fn(async () => true) }));
vi.mock("../../stores/modal.svelte", () => ({ modalState: modalMock }));

const toastMock = vi.hoisted(() => ({
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    add: vi.fn(),
}));
vi.mock("../../services/toastService.svelte", () => ({ toastService: toastMock }));

const accountPort = vi.hoisted(() => ({
    changeLeverage: vi.fn(async () => undefined),
    changeMarginMode: vi.fn(async () => undefined),
    changePositionMode: vi.fn(async () => undefined),
    adjustPositionMargin: vi.fn(async () => undefined),
    fetchLeverageMarginMode: vi.fn(async () => undefined),
    fetchPositionMode: vi.fn(async () => undefined),
}));
const supportsMock = vi.hoisted(() => ({ accountSettings: true }));
vi.mock("../../services/exchange", () => ({
    activeExchange: () => ({ supports: supportsMock, account: accountPort }),
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

import ExchangeAccountControls from "./ExchangeAccountControls.svelte";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

/** A position shaped the way the store really holds one. */
function position(overrides: Record<string, unknown> = {}) {
    return { symbol: "BTCUSDT", ...overrides };
}

beforeEach(() => {
    vi.clearAllMocks();
    // FEAT-0020: the panel now reads the confirmation policy, so each test
    // starts from the shipped defaults rather than the previous test's choice.
    confirmationPolicyStore.reset();
    settings.apiProvider = "bitunix";
    supportsMock.accountSettings = true;
    paperStateMock.enabled = false;
    tradeStateMock.symbol = "BTCUSDT";
    tradeStateMock.leverage = "20";
    tradeStateMock.remoteLeverage = new Decimal(10);
    tradeStateMock.remoteMarginMode = "ISOLATION";
    marketStateMock.symbolMeta = { BTCUSDT: { symbol: "BTCUSDT", minLeverage: 1, maxLeverage: 50 } };
    accountStateMock.positions = [];
    accountStateMock.openOrders = [];
    accountStateMock.positionMode = "ONE_WAY";
    accountStateMock.positionModeAt = undefined;
    accountStateMock.positionModeVerifying = false;
    accountStateMock.marginModeVerifying = false;
    tradeStateMock.remoteAccountStateAt = undefined;
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
    component = mount(ExchangeAccountControls, { target: host }) as never;
    await settle();
}

function button(trackId: string): HTMLButtonElement | null {
    return host.querySelector(`[data-track-id="${trackId}"]`);
}

function draftInput(): HTMLInputElement | null {
    return host.querySelector("#leverage-popover-input");
}

/** Open the leverage dialog and type a value into it. */
async function openLeverageAndType(value: string) {
    button("btn-leverage-chip")?.click();
    await settle();
    const input = draftInput();
    if (!input) throw new Error("leverage dialog did not open");
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();
}

/** Open the shared margin/position-mode dialog. */
async function openModeModal() {
    button("btn-mode-chip")?.click();
    await settle();
}

describe("FEAT-0328 — nothing travels without a confirmation", () => {
    it("picking a margin mode sends nothing until Confirm", async () => {
        await render();
        await openModeModal();

        button("btn-margin-mode-cross")?.click();
        await settle();
        expect(accountPort.changeMarginMode).not.toHaveBeenCalled();

        button("btn-mode-confirm")?.click();
        await settle();
        expect(accountPort.changeMarginMode).toHaveBeenCalledWith("BTCUSDT", "CROSS");
    });

    it("picking a position mode sends nothing until Confirm", async () => {
        await render();
        await openModeModal();

        button("btn-position-mode-hedge")?.click();
        await settle();
        expect(accountPort.changePositionMode).not.toHaveBeenCalled();

        button("btn-mode-confirm")?.click();
        await settle();
        expect(accountPort.changePositionMode).toHaveBeenCalledWith("HEDGE");
    });

    it("cancelling the dialog discards the picks", async () => {
        await render();
        await openModeModal();

        button("btn-margin-mode-cross")?.click();
        button("btn-position-mode-hedge")?.click();
        await settle();

        button("btn-mode-cancel")?.click();
        await settle();

        expect(accountPort.changeMarginMode).not.toHaveBeenCalled();
        expect(accountPort.changePositionMode).not.toHaveBeenCalled();
    });

    it("cannot confirm when nothing was changed", async () => {
        // ISOLATION / ONE_WAY are already what the exchange reports.
        await render();
        await openModeModal();

        expect(button("btn-mode-confirm")?.disabled).toBe(true);
    });

    it("sends only what actually differs, not the mode already set", async () => {
        await render();
        await openModeModal();

        button("btn-position-mode-hedge")?.click();
        await settle();
        button("btn-mode-confirm")?.click();
        await settle();

        expect(accountPort.changePositionMode).toHaveBeenCalledTimes(1);
        // Margin mode was left on ISOLATION, which it already was.
        expect(accountPort.changeMarginMode).not.toHaveBeenCalled();
    });

    it("keeps the dialog open when one of two changes failed", async () => {
        // A half-applied account is the one state the trader must not have to
        // guess at, so the dialog stays up and the error is reported.
        accountPort.changePositionMode.mockRejectedValueOnce(
            new Error("exchange refused") as never,
        );
        await render();
        await openModeModal();

        button("btn-margin-mode-cross")?.click();
        button("btn-position-mode-hedge")?.click();
        await settle();
        button("btn-mode-confirm")?.click();
        await settle();

        expect(accountPort.changeMarginMode).toHaveBeenCalledTimes(1);
        expect(toastMock.error).toHaveBeenCalled();
        expect(button("btn-mode-confirm")).not.toBeNull();
    });

    it("moving the leverage slider sends nothing until Confirm", async () => {
        await render();
        button("btn-leverage-chip")?.click();
        await settle();

        const slider = host.querySelector(
            '[data-track-id="slider-leverage"]',
        ) as HTMLInputElement;
        slider.value = "30";
        slider.dispatchEvent(new Event("input", { bubbles: true }));
        await settle();

        expect(draftInput()?.value).toBe("30");
        expect(accountPort.changeLeverage).not.toHaveBeenCalled();

        button("btn-leverage-apply")?.click();
        await settle();
        expect(accountPort.changeLeverage).toHaveBeenCalledTimes(1);
    });
});

describe("FEAT-0328 — leverage is set from its chip, not from the calculator", () => {
    it("opens a dialog seeded with the value the exchange reports", async () => {
        await render();
        button("btn-leverage-chip")?.click();
        await settle();

        expect(draftInput()?.value).toBe("10");
    });

    it("states plainly that leverage may be changed with an open position", async () => {
        // A verified fact from the venue's own docs, not reassurance.
        await render();
        button("btn-leverage-chip")?.click();
        await settle();

        expect(
            host.querySelector('[data-track-id="note-leverage-anytime"]')?.textContent,
        ).toContain("any time");
    });

    it("sends what the dialog holds, ignoring the calculator's own input", async () => {
        tradeStateMock.leverage = "99";
        await render();
        await openLeverageAndType("20");

        button("btn-leverage-apply")?.click();
        await settle();

        expect(accountPort.changeLeverage).toHaveBeenCalledTimes(1);
        const [symbol, value] = accountPort.changeLeverage.mock.calls[0] as unknown as [
            string,
            Decimal,
        ];
        expect(symbol).toBe("BTCUSDT");
        expect(value.toString()).toBe("20");
    });

    it("refuses one above the pair's maxLeverage, and says the range", async () => {
        await render();
        await openLeverageAndType("100"); // pair tops out at 50

        const apply = button("btn-leverage-apply");
        expect(apply?.disabled).toBe(true);
        expect(apply?.title).toContain("50");

        apply?.click();
        await settle();
        expect(accountPort.changeLeverage).not.toHaveBeenCalled();
    });

    it("refuses one below the pair's minLeverage", async () => {
        marketStateMock.symbolMeta = {
            BTCUSDT: { symbol: "BTCUSDT", minLeverage: 5, maxLeverage: 50 },
        };
        await render();
        await openLeverageAndType("2");

        expect(button("btn-leverage-apply")?.disabled).toBe(true);
        button("btn-leverage-apply")?.click();
        await settle();
        expect(accountPort.changeLeverage).not.toHaveBeenCalled();
    });

    it("refuses a fractional leverage — the endpoint takes a whole number", async () => {
        await render();
        await openLeverageAndType("12.5");

        expect(button("btn-leverage-apply")?.disabled).toBe(true);
        button("btn-leverage-apply")?.click();
        await settle();
        expect(accountPort.changeLeverage).not.toHaveBeenCalled();
    });

    it("clamps the steppers to the pair's own range", async () => {
        await render();
        await openLeverageAndType("50"); // at the pair's maximum

        button("btn-leverage-plus")?.click();
        await settle();
        expect(draftInput()?.value).toBe("50");

        button("btn-leverage-minus")?.click();
        await settle();
        expect(draftInput()?.value).toBe("49");
    });

    it("re-seeds from the exchange on each open, so a stale draft cannot survive", async () => {
        await render();
        await openLeverageAndType("35");
        button("btn-leverage-cancel")?.click();
        await settle();

        button("btn-leverage-chip")?.click();
        await settle();
        expect(draftInput()?.value).toBe("10");
    });
});

describe("FEAT-0328 — with no broker value the chip edits locally and sends nothing", () => {
    it("writes the calculator's leverage instead of calling the exchange", async () => {
        tradeStateMock.remoteLeverage = undefined;
        tradeStateMock.leverage = "20";
        await render();
        await openLeverageAndType("15");

        button("btn-leverage-apply")?.click();
        await settle();

        expect(accountPort.changeLeverage).not.toHaveBeenCalled();
        expect(tradeStateMock.leverage).toBe("15");
    });

    it("does the same in paper trading, where nothing may reach the exchange", async () => {
        paperStateMock.enabled = true;
        tradeStateMock.leverage = "20";
        await render();
        await openLeverageAndType("15");

        button("btn-leverage-apply")?.click();
        await settle();

        expect(accountPort.changeLeverage).not.toHaveBeenCalled();
        expect(tradeStateMock.leverage).toBe("15");
    });
});

describe("FEAT-0328 — the three writes stay gated differently", () => {
    it("leaves leverage operable while the symbol carries an open position", async () => {
        accountStateMock.positions = [position()];
        await render();

        expect(button("btn-leverage-chip")?.disabled).toBe(false);
    });

    it("leaves leverage operable while a resting order sits on the symbol", async () => {
        accountStateMock.openOrders = [{ symbol: "BTCUSDT" }];
        await render();

        expect(button("btn-leverage-chip")?.disabled).toBe(false);
    });

    it("gates the three differently for one open position on this symbol", async () => {
        accountStateMock.positions = [position()];
        await render();
        await openModeModal();

        expect(button("btn-leverage-chip")?.disabled).toBe(false);
        expect(button("btn-margin-mode-isolated")?.disabled).toBe(true);
        expect(button("btn-position-mode-hedge")?.disabled).toBe(true);
    });

    it("gates them differently again for a position on another symbol", async () => {
        // Margin mode is free here — that symbol is clear. Position mode is
        // not: its endpoint is account-wide and takes no symbol at all.
        accountStateMock.positions = [position({ symbol: "ETHUSDT" })];
        await render();
        await openModeModal();

        expect(button("btn-leverage-chip")?.disabled).toBe(false);
        expect(button("btn-margin-mode-cross")?.disabled).toBe(false);
        expect(button("btn-position-mode-hedge")?.disabled).toBe(true);
    });

    it("shows each blocked section its own reason, inside the shared dialog", async () => {
        accountStateMock.positions = [position()];
        await render();
        await openModeModal();

        expect(
            host.querySelector('[data-track-id="reason-margin-mode"]')?.textContent,
        ).toContain("BTCUSDT");
        expect(
            host.querySelector('[data-track-id="reason-position-mode"]')?.textContent,
        ).toContain("any position");
    });

    it("blocks both modes in paper trading, where nothing can reach the exchange", async () => {
        paperStateMock.enabled = true;
        await render();
        await openModeModal();

        expect(button("btn-margin-mode-cross")?.disabled).toBe(true);
        expect(button("btn-position-mode-hedge")?.disabled).toBe(true);
    });
});

describe("FEAT-0068 — leverage on an open position is confirmed, not blocked", () => {
    it("asks first, then sends", async () => {
        accountStateMock.positions = [position()];
        await render();
        await openLeverageAndType("20");

        button("btn-leverage-apply")?.click();
        await settle();

        expect(modalMock.show).toHaveBeenCalledTimes(1);
        expect(accountPort.changeLeverage).toHaveBeenCalledTimes(1);
    });

    it("sends nothing when that confirmation is declined", async () => {
        accountStateMock.positions = [position()];
        modalMock.show.mockResolvedValueOnce(false as never);
        await render();
        await openLeverageAndType("20");

        button("btn-leverage-apply")?.click();
        await settle();

        expect(accountPort.changeLeverage).not.toHaveBeenCalled();
    });

    /*
     * FEAT-0020 wired this to FEAT-0024's policy, which changed what "nothing
     * open" means here. It used to mean "never ask"; it now means "the user's
     * setting decides", and `leverage-change` ships defaulted on.
     *
     * The open-position case above is unchanged and deliberately so: that
     * dialog carries the projected liquidation price, a consequence rather
     * than a prompt, and no setting switches it off.
     */
    it("asks when the symbol has nothing open and the policy wants it", async () => {
        confirmationPolicyStore.setRequired("leverage-change", true);
        await render();
        await openLeverageAndType("20");

        button("btn-leverage-apply")?.click();
        await settle();

        expect(modalMock.show).toHaveBeenCalledTimes(1);
        expect(accountPort.changeLeverage).toHaveBeenCalledTimes(1);
    });

    it("does not ask when the symbol has nothing open and the policy is off", async () => {
        confirmationPolicyStore.setRequired("leverage-change", false);
        await render();
        await openLeverageAndType("20");

        button("btn-leverage-apply")?.click();
        await settle();

        expect(modalMock.show).not.toHaveBeenCalled();
        expect(accountPort.changeLeverage).toHaveBeenCalledTimes(1);
    });

    it("shows the liquidation shift live, calibrated on the venue's own numbers", async () => {
        /*
         * entry 100, leverage 10, venue-reported liquidation 91.
         * Implied MMR = 91/100 - 1 + 1/10 = 0.01.
         * At 20x: 100 * (1 - 1/20 + 0.01) = 96 — liquidation moves toward
         * entry as leverage rises, which is the consequence being shown.
         */
        accountStateMock.positions = [
            position({
                entryPrice: new Decimal(100),
                liquidationPrice: new Decimal(91),
                leverage: new Decimal(10),
            }),
        ];
        await render();
        await openLeverageAndType("20");

        const live = host.querySelector('[data-track-id="leverage-liquidation"]');
        expect(live?.textContent).toContain("91");
        expect(live?.textContent).toContain("96");
    });

    it("repeats that shift in the confirmation, as the last thing read before sending", async () => {
        accountStateMock.positions = [
            position({
                entryPrice: new Decimal(100),
                liquidationPrice: new Decimal(91),
                leverage: new Decimal(10),
            }),
        ];
        await render();
        await openLeverageAndType("20");

        button("btn-leverage-apply")?.click();
        await settle();

        const [, message] = modalMock.show.mock.calls[0] as unknown as [string, string];
        expect(message).toContain("91");
        expect(message).toContain("96");
    });

    it("shows no estimate at all when the venue gave no numbers", async () => {
        // A wrong number on a money screen is worse than none.
        accountStateMock.positions = [position()];
        await render();
        await openLeverageAndType("20");

        expect(host.querySelector('[data-track-id="leverage-liquidation"]')).toBeNull();

        button("btn-leverage-apply")?.click();
        await settle();
        const [, message] = modalMock.show.mock.calls[0] as unknown as [string, string];
        expect(message).not.toContain("estimate");
        expect(accountPort.changeLeverage).toHaveBeenCalledTimes(1);
    });

    it("sends both margin and position mode changes in a single confirmModes call", async () => {
        // Direct test: confirmModes must call the service with the right payloads
        // for both modes. This is the real-money send path that must not regress.
        await render();
        await openModeModal();

        // Change both: margin ISOLATION → CROSS, position ONE_WAY → HEDGE
        button("btn-margin-mode-cross")?.click();
        button("btn-position-mode-hedge")?.click();
        await settle();

        button("btn-mode-confirm")?.click();
        await settle();

        // Both services called exactly once each with correct mode
        expect(accountPort.changeMarginMode).toHaveBeenCalledTimes(1);
        expect(accountPort.changeMarginMode).toHaveBeenCalledWith("BTCUSDT", "CROSS");

        expect(accountPort.changePositionMode).toHaveBeenCalledTimes(1);
        expect(accountPort.changePositionMode).toHaveBeenCalledWith("HEDGE");

        // Dialog closes on success
        expect(button("btn-mode-confirm")).toBeNull();
    });

    it("half-applied: margin succeeds, position fails → dialog stays open, error shown", async () => {
        // Half-applied state must be visible: if one of two changes fails,
        // the dialog stays open so the trader can see which one failed.
        accountPort.changePositionMode.mockRejectedValueOnce(
            new Error("position mode not allowed") as never,
        );
        await render();
        await openModeModal();

        button("btn-margin-mode-cross")?.click();
        button("btn-position-mode-hedge")?.click();
        await settle();

        button("btn-mode-confirm")?.click();
        await settle();

        // Margin call succeeded
        expect(accountPort.changeMarginMode).toHaveBeenCalledTimes(1);
        expect(accountPort.changeMarginMode).toHaveBeenCalledWith("BTCUSDT", "CROSS");

        // Position call failed
        expect(accountPort.changePositionMode).toHaveBeenCalledTimes(1);

        // Dialog stays open (button still visible)
        expect(button("btn-mode-confirm")).not.toBeNull();

        // Error is visible
        expect(toastMock.error).toHaveBeenCalled();
    });
});

describe("FEAT-0068 — a venue without these endpoints offers no controls", () => {
    it("renders nothing where the adapter declares no support", async () => {
        // Not a disabled control here: the refusal a trader would need to
        // read belongs to the venue (`exchange.unsupported.accountSettings`),
        // and offering dead chips on every Bitget session is noise, not
        // information. The parent's row simply has one fewer column.
        supportsMock.accountSettings = false;
        await render();

        expect(button("btn-leverage-chip")).toBeNull();
        expect(button("btn-mode-chip")).toBeNull();
        expect(host.textContent?.trim()).toBe("");
    });
});

/** Open the modes dialog, pick a margin mode, and commit it. */
async function chooseMarginMode(mode: "CROSS" | "ISOLATION") {
    await openModeModal();
    button(mode === "CROSS" ? "btn-margin-mode-cross" : "btn-margin-mode-isolated")?.click();
    await settle();
    button("btn-mode-confirm")?.click();
    await settle();
}

describe("FEAT-0020 — the mode writes ask before they change the account", () => {
    /*
     * `margin-mode-change` shipped in FEAT-0024 defaulted on, and this panel
     * had no confirmation on the mode path at all — the settings toggle
     * existed and changed nothing. These pin that it now does something, and
     * that an open position asks regardless of the setting.
     */

    it("asks before changing margin mode", async () => {
        confirmationPolicyStore.setRequired("margin-mode-change", true);
        await render();
        await chooseMarginMode("CROSS");

        expect(modalMock.show).toHaveBeenCalledTimes(1);
        expect(accountPort.changeMarginMode).toHaveBeenCalledTimes(1);
    });

    it("sends nothing when the confirmation is declined", async () => {
        // The claim this file cares about most: the unsent request, not the
        // message.
        confirmationPolicyStore.setRequired("margin-mode-change", true);
        modalMock.show.mockResolvedValueOnce(false as never);
        await render();
        await chooseMarginMode("CROSS");

        expect(accountPort.changeMarginMode).not.toHaveBeenCalled();
    });

    it("does not ask when the policy is off and nothing is open", async () => {
        confirmationPolicyStore.setRequired("margin-mode-change", false);
        await render();
        await chooseMarginMode("CROSS");

        expect(modalMock.show).not.toHaveBeenCalled();
        expect(accountPort.changeMarginMode).toHaveBeenCalledTimes(1);
    });

    it("never reaches a confirmation with a position open — it is blocked first", async () => {
        /*
         * The open-position case that makes leverage always ask does not
         * arise here: `marginModeReason` disables the control outright,
         * because the venue refuses the change. Asserting the block rather
         * than a dialog keeps this test honest about which safeguard is
         * actually doing the work.
         */
        confirmationPolicyStore.setRequired("margin-mode-change", true);
        accountStateMock.positions = [position()];
        await render();
        await openModeModal();

        expect(button("btn-margin-mode-cross")?.disabled).toBe(true);
        expect(modalMock.show).not.toHaveBeenCalled();
        expect(accountPort.changeMarginMode).not.toHaveBeenCalled();
    });
});

describe("BUG-1 — margin mode has an initial read", () => {
    it("fetches leverage/margin mode on mount for the current symbol", async () => {
        await render();
        expect(accountPort.fetchLeverageMarginMode).toHaveBeenCalledWith("BTCUSDT");
    });

    it("shows both modes in the chip title once the broker answered", async () => {
        await render();
        const chip = button("btn-mode-chip")?.querySelector("span[title]");
        expect(chip?.getAttribute("title")).toContain("\u2022");
    });
});

describe("BUG-2 — a broker push moves the chip without a reload", () => {
    it("re-reads margin mode when a WS position disagrees with the chip", async () => {
        accountStateMock.positions = [{ symbol: "BTCUSDT", marginMode: "cross" }];
        await render();
        expect(accountPort.fetchLeverageMarginMode).toHaveBeenCalledWith("BTCUSDT");
    });

    it("re-reads when a WS position carries a different leverage", async () => {
        accountStateMock.positions = [{ symbol: "BTCUSDT", marginMode: "isolation", leverage: "5" }];
        await render();
        // Mount effect plus bridge effect, both for this symbol.
        expect(accountPort.fetchLeverageMarginMode).toHaveBeenCalledTimes(2);
    });

    it("does not re-read when the push agrees with the chip", async () => {
        accountStateMock.positions = [{ symbol: "BTCUSDT", marginMode: "isolation" }];
        await render();
        // Mount effect only: the bridge effect finds no disagreement.
        expect(accountPort.fetchLeverageMarginMode).toHaveBeenCalledTimes(1);
    });

    it("re-syncs the account when a WS order carries a new position mode", async () => {
        accountStateMock.openOrders = [{ symbol: "BTCUSDT", positionMode: "HEDGE" }];
        await render();
        expect(accountStateMock.requestSync).toHaveBeenCalled();
    });
});

describe("BUG-1b — the chip fills its right half on its own", () => {
    it("fetches position mode on mount when the sidebar never did", async () => {
        accountStateMock.positionMode = undefined;
        await render();
        expect(accountPort.fetchPositionMode).toHaveBeenCalledTimes(1);
    });

    it("fills the right half even with no symbol selected", async () => {
        // No symbol means the paired refresh does not run, and the right half
        // would otherwise sit empty next to a working left half.
        tradeStateMock.symbol = "";
        accountStateMock.positionMode = undefined;
        await render();
        expect(accountPort.fetchPositionMode).toHaveBeenCalledTimes(1);
        expect(accountPort.fetchLeverageMarginMode).not.toHaveBeenCalled();
    });

    it("still reads it alongside the margin half on a symbol change", async () => {
        // BUG-0409 changed this: the chip used to skip the read whenever the
        // value was already known, which is exactly how one half kept ageing
        // past the other. Both halves are now read together, so the pair is
        // stamped from the same moment.
        await render();
        expect(accountPort.fetchPositionMode).toHaveBeenCalledTimes(1);
    });
});

/*
 * BUG-0409 — the chip must never pair two values from different moments.
 *
 * The halves come from different endpoints on different triggers, each with
 * its own stamp. Live, that produced `Cross • Hedge` on screen: a combination
 * that had never existed on any venue, margin truth from one era beside
 * position truth from another.
 */
describe("BUG-0409 — halves from different eras are not paired", () => {
    /** Text of the chip, halves and separator included. */
    function chipText(): string {
        return button("btn-mode-chip")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    }

    it("shows both halves while their stamps are close together", async () => {
        const now = Date.now();
        tradeStateMock.remoteAccountStateAt = now;
        accountStateMock.positionModeAt = now - 1_000;

        await render();

        expect(chipText()).toContain("Isolated");
        expect(chipText()).toContain("One-way");
    });

    it("blanks the older half once the two drift far apart", async () => {
        const now = Date.now();
        // The margin half was last confirmed five minutes before the other.
        tradeStateMock.remoteAccountStateAt = now - 300_000;
        accountStateMock.positionModeAt = now;

        await render();

        expect(chipText()).not.toContain("Isolated");
        expect(chipText()).toContain("One-way");
    });

    it("blanks the position half when that is the older one", async () => {
        const now = Date.now();
        tradeStateMock.remoteAccountStateAt = now;
        accountStateMock.positionModeAt = now - 300_000;

        await render();

        expect(chipText()).toContain("Isolated");
        expect(chipText()).not.toContain("One-way");
    });

    it("says in the tooltip why a half went blank", async () => {
        const now = Date.now();
        tradeStateMock.remoteAccountStateAt = now - 300_000;
        accountStateMock.positionModeAt = now;

        await render();

        const title = button("btn-mode-chip")?.querySelector("span[title]")
            ?.getAttribute("title") ?? "";
        // Both values still named — hiding the pairing is the point, hiding
        // the reason is not.
        expect(title).toContain("Isolated");
        expect(title).toContain("unknown");
    });

    it("pairs nothing when one half has never been read", async () => {
        // No stamp at all is "never confirmed", not "infinitely old": the
        // existing undefined-value handling already covers it.
        tradeStateMock.remoteAccountStateAt = Date.now();
        accountStateMock.positionModeAt = undefined;

        await render();

        expect(chipText()).toContain("Isolated");
        expect(chipText()).toContain("One-way");
    });

    it("shows a checking marker while a write is being read back", async () => {
        accountStateMock.positionModeVerifying = true;

        await render();

        expect(chipText()).toContain("checking");
    });
});

describe("BUG-0409 — returning to the tab re-reads both halves", () => {
    it("reads on focus, because no venue pushes a settings change", async () => {
        await render();
        accountPort.fetchLeverageMarginMode.mockClear();
        accountPort.fetchPositionMode.mockClear();

        window.dispatchEvent(new Event("focus"));
        await settle();

        expect(accountPort.fetchLeverageMarginMode).toHaveBeenCalledWith("BTCUSDT");
        expect(accountPort.fetchPositionMode).toHaveBeenCalledTimes(1);
    });

    it("ignores a second focus inside the minimum gap", async () => {
        await render();
        window.dispatchEvent(new Event("focus"));
        await settle();
        accountPort.fetchPositionMode.mockClear();

        // Alt-tabbing is not a request for account data.
        window.dispatchEvent(new Event("focus"));
        await settle();

        expect(accountPort.fetchPositionMode).not.toHaveBeenCalled();
    });
});
