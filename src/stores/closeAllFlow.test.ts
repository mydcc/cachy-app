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
 * BUG-0513 — the shared close-all flow both buttons use.
 *
 * Pins the panic semantics: the dialog is unconditional and states count
 * plus total notional, cancel runs nothing, an empty book toasts instead of
 * sending, and a second invocation while one runs is refused.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "decimal.js";
import { confirmAndCloseAllPositions } from "./closeAllFlow";

const showMock = vi.hoisted(() => vi.fn());
vi.mock("./modal.svelte", () => ({ modalState: { show: showMock } }));

const positionsMock = vi.hoisted(() => ({ list: [] as never[] }));
vi.mock("./account.svelte", () => ({
    accountState: {
        get positions() {
            return positionsMock.list;
        },
    },
}));

const toastMock = vi.hoisted(() => ({ showToast: vi.fn(), showError: vi.fn() }));
vi.mock("./ui.svelte", () => ({ uiState: toastMock }));

const invalidateMock = vi.hoisted(() => vi.fn());
vi.mock("./tpsl.svelte", () => ({ tpSlState: { invalidate: invalidateMock } }));

const closeAllMock = vi.hoisted(() => vi.fn());
vi.mock("../services/exchange", () => ({
    activeExchange: () => ({ trading: { closeAllPositions: closeAllMock } }),
}));

vi.mock("../services/logger", () => ({
    logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

vi.mock("../locales/i18n", async () => {
    const { readable: r } = await import("svelte/store");
    return {
        _: r((key: string, options?: { values?: Record<string, unknown> }) => {
            const values = options?.values
                ? ` ${JSON.stringify(options.values)}`
                : "";
            return `${key}${values}`;
        }),
    };
});

function position(symbol: string) {
    return {
        symbol,
        side: "long",
        size: new Decimal(1),
        entryPrice: new Decimal(50000),
        markPrice: new Decimal(51000),
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    positionsMock.list = [];
});

describe("closeAllFlow", () => {
    it("confirms with count and notional, then runs the flatten", async () => {
        positionsMock.list = [position("BTCUSDT"), position("ETHUSDT")] as never[];
        showMock.mockResolvedValue(true);
        closeAllMock.mockResolvedValue({});

        const outcome = await confirmAndCloseAllPositions();

        expect(outcome).toEqual({ confirmed: 2 });
        expect(showMock).toHaveBeenCalledTimes(1);
        const [title, message] = showMock.mock.calls[0];
        expect(title).toBe("trade.closeAllConfirmTitle");
        expect(message).toContain("trade.closeAllConfirmMessage");
        expect(message).toContain("2");
        expect(closeAllMock).toHaveBeenCalledTimes(1);
        expect(closeAllMock).toHaveBeenCalledWith(undefined);
        expect(invalidateMock).toHaveBeenCalledTimes(1);
        expect(toastMock.showToast).toHaveBeenCalledWith(
            expect.stringContaining("trade.closeAllSuccess"),
            "success",
        );
    });

    it("runs nothing when the trader cancels", async () => {
        positionsMock.list = [position("BTCUSDT")] as never[];
        showMock.mockResolvedValue(false);

        expect(await confirmAndCloseAllPositions()).toBeNull();
        expect(closeAllMock).not.toHaveBeenCalled();
        expect(invalidateMock).not.toHaveBeenCalled();
    });

    it("toasts instead of sending when nothing is open", async () => {
        expect(await confirmAndCloseAllPositions()).toBeNull();
        expect(showMock).not.toHaveBeenCalled();
        expect(closeAllMock).not.toHaveBeenCalled();
        expect(toastMock.showToast).toHaveBeenCalledWith(
            expect.stringContaining("trade.closeAllEmpty"),
            "info",
        );
    });

    it("refuses a second run while one is in flight", async () => {
        positionsMock.list = [position("BTCUSDT")] as never[];
        let release!: (value: boolean) => void;
        showMock.mockImplementation(
            () => new Promise<boolean>((resolve) => {
                release = resolve;
            }),
        );
        closeAllMock.mockResolvedValue({});

        const first = confirmAndCloseAllPositions();
        // The dialog is showing for the first run …
        expect(showMock).toHaveBeenCalledTimes(1);
        // … so the second run is refused without a second dialog.
        await expect(confirmAndCloseAllPositions()).resolves.toBeNull();
        expect(showMock).toHaveBeenCalledTimes(1);

        release(true);
        await expect(first).resolves.toEqual({ confirmed: 1 });
        expect(closeAllMock).toHaveBeenCalledTimes(1);
    });

    it("resolves null without a second toast when the run fails", async () => {
        positionsMock.list = [position("BTCUSDT")] as never[];
        showMock.mockResolvedValue(true);
        closeAllMock.mockRejectedValue(new Error("trade.closeAllFailed"));

        expect(await confirmAndCloseAllPositions()).toBeNull();
        // The service owns failure reporting — the flow stays quiet …
        expect(toastMock.showToast).not.toHaveBeenCalledWith(
            expect.anything(),
            "success",
        );
        // … but reconciles TP/SL hygiene: legs that did close before the
        // failure must not keep cached stops.
        expect(invalidateMock).toHaveBeenCalledTimes(1);
    });

    it("prices notional off entry when the mark is the zero default", async () => {
        positionsMock.list = [
            {
                symbol: "BTCUSDT",
                side: "long",
                size: new Decimal(2),
                entryPrice: new Decimal(50000),
                markPrice: new Decimal(0),
            },
        ] as never[];
        showMock.mockResolvedValue(true);
        closeAllMock.mockResolvedValue({});

        await confirmAndCloseAllPositions();

        const [, message] = showMock.mock.calls[0];
        // 2 × 50000 entry, not 2 × 0 mark.
        expect(message).toContain("100000");
    });
});
