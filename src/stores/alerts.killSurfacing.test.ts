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

/**
 * FEAT-0822 review — the kill switch's refused closes are said, not collected.
 *
 * `closeBotOwnedPositions` gathers {closed, refused} for its caller and, since
 * the review, reports each refusal through the exit lane's own channel
 * (`reportBotExitRefusal`), so a row whose close refused — paper off, gate
 * refusal, position gone mid-flight — is never a position the trader believes
 * is gone while it is still owned. This pins the wiring: one mocked exit
 * refusal in, one toast out, and the {closed, refused} answer unchanged.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/env", () => ({ browser: true, dev: false }));

const toastError = vi.hoisted(() => vi.fn());
vi.mock("../services/toastService.svelte", () => ({
    toastService: { error: toastError, success: vi.fn(), add: vi.fn() },
}));

// The exit lane, at the seam the kill path consumes: the submission refuses,
// the environment is a stub. What is under test is the wiring above it.
vi.mock("../services/alertEngine/botExits", () => ({
    submitBotExit: vi.fn(async () => "close-refused"),
    botExitEnvironment: vi.fn(() => ({
        paperEnabled: () => true,
        close: vi.fn(),
        ownedPosition: () => undefined,
    })),
}));

vi.mock("../services/tradeService", () => ({
    tradeService: { closePosition: vi.fn() },
}));

const botFixture = vi.hoisted(() => ({
    schema_version: 4,
    id: "bot-1",
    name: "kill bot",
    symbol: "BTCUSDT",
    trigger_timeframe: "1m",
    conditions: {
        kind: "compare",
        left: { kind: "price", field: "close" },
        op: "gte",
        right: { kind: "constant", value: "100" },
        timeframe: "1m",
    },
    action: {
        consequence_level: "simulate",
        order: { side: "buy", size_basis: "percent_of_equity", size: "1" },
    },
    enabled: true,
    provenance: { source: "human", created_at_ms: 0 },
}));

vi.mock("../services/alertEngine/botStore", () => ({
    readBots: () => [botFixture],
    setBotEnabled: vi.fn(),
}));

import { closeBotOwnedPositions } from "./alerts.svelte";
import { paperState } from "./paperTrading.svelte";

beforeEach(() => {
    vi.clearAllMocks();
    paperState.resetBook();
});

describe("FEAT-0822 review — the kill surfaces refused closes", () => {
    it("reports each refused row through the exit channel and still returns the answer", async () => {
        paperState.positions.push({
            positionId: "paper-1",
            symbol: "BTCUSDT",
            side: "long",
            amount: "1",
            entryPrice: "100",
            leverage: "1",
            marginMode: "isolated",
            realizedPnl: "0",
            openedAt: 0,
            origin: "bot",
            botId: "bot-1",
        } as never);

        const answer = await closeBotOwnedPositions("bot-1");

        // The caller's accounting is unchanged — the {closed, refused} shape
        // the component tests assert on.
        expect(answer).toEqual({ closed: 0, refused: ["close-refused"] });

        // And the refusal was said: one toast through the exit lane's own
        // register, not a silent row the trader believes is gone.
        expect(toastError).toHaveBeenCalledTimes(1);
    });

    it("says nothing when every close landed", async () => {
        const { submitBotExit } = await import("../services/alertEngine/botExits");
        vi.mocked(submitBotExit).mockResolvedValueOnce(null);

        paperState.positions.push({
            positionId: "paper-1",
            symbol: "BTCUSDT",
            side: "long",
            amount: "1",
            entryPrice: "100",
            leverage: "1",
            marginMode: "isolated",
            realizedPnl: "0",
            openedAt: 0,
            origin: "bot",
            botId: "bot-1",
        } as never);

        const answer = await closeBotOwnedPositions("bot-1");
        expect(answer).toEqual({ closed: 1, refused: [] });
        expect(toastError).not.toHaveBeenCalled();
    });
});
