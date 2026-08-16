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

import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./+server";
import * as clientToken from "../../../lib/server/clientToken";

/*
 * Regression (BUG-0219): the route built its outbound payload with `type`,
 * but place_order documents the field as `orderType` and requires it
 * (docs/bitunix-api/07_trade.md:584). No order type reached the exchange.
 *
 * It went unnoticed because the only caller for a long time was
 * close-position, which sends MARKET — whatever Bitunix does with a missing
 * orderType, it happened to match what that path wanted. The first LIMIT
 * order placed through this route is what surfaced it.
 */

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const getClientAddress = () => "127.0.0.1";

function makeRequest(body: unknown): Request {
    return {
        text: async () => JSON.stringify(body),
        headers: new Headers(),
    } as unknown as Request;
}

function sentBody() {
    const [, options] = fetchMock.mock.calls[0];
    return JSON.parse((options as { body: string }).body);
}

const CREDS = { apiKey: "validApiKey123", apiSecret: "validSecret123456" };

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(clientToken, "checkClientToken").mockReturnValue(null);
    fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ code: 0, data: { orderId: "1" }, msg: "Success" }),
    });
});

async function post(body: Record<string, unknown>) {
    return POST({
        request: makeRequest({ exchange: "bitunix", ...CREDS, ...body }),
        getClientAddress,
    } as unknown as Parameters<typeof POST>[0]);
}

describe("POST /api/orders sends the order type under the name Bitunix documents", () => {
    it("sends orderType, not type, for a LIMIT order", async () => {
        await post({
            type: "place-order",
            symbol: "BTCUSDT",
            side: "BUY",
            orderType: "LIMIT",
            qty: "0.02",
            price: "50000",
            effect: "GTC",
        });

        const body = sentBody();
        expect(body.orderType).toBe("LIMIT");
        // The whole defect in one assertion: `type` on the wire is not a field
        // place_order knows, so the order type was simply absent.
        expect(body.type).toBeUndefined();
    });

    it("sends orderType for a MARKET order too", async () => {
        await post({
            type: "place-order",
            symbol: "BTCUSDT",
            side: "SELL",
            orderType: "MARKET",
            qty: "0.02",
        });

        const body = sentBody();
        expect(body.orderType).toBe("MARKET");
        expect(body.type).toBeUndefined();
    });

    it("sends orderType on a close-position order", async () => {
        // This is the path that masked the bug, so it gets its own assertion.
        await post({
            type: "close-position",
            symbol: "BTCUSDT",
            side: "SELL",
            amount: "0.02",
        });

        const body = sentBody();
        expect(body.orderType).toBe("MARKET");
        expect(body.reduceOnly).toBe(true);
        expect(body.type).toBeUndefined();
    });

    it("still requires a price for a LIMIT order", async () => {
        // The LIMIT-price check reads the renamed field; if it had been left
        // reading `type` it would silently stop checking anything.
        const res = await post({
            type: "place-order",
            symbol: "BTCUSDT",
            side: "BUY",
            orderType: "LIMIT",
            qty: "0.02",
        });

        expect(res.status).toBe(500);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
