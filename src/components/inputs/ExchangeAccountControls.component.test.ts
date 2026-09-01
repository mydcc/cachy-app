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
    }>,
    openOrders: [] as Array<{ symbol: string }>,
    positionMode: "ONE_WAY" as string | undefined,
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

    it("does not ask when the symbol has nothing open", async () => {
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
