import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { exchangeAdapters } from "./registry";
import { accountState } from "../../stores/account.svelte";
import { settingsState } from "../../stores/settings.svelte";
import { bitgetWs } from "../bitgetWs";
import { bitunixWs } from "../bitunixWs";

let wsInstances: MockWebSocket[] = [];

class MockWebSocket {
    url: string;
    readyState = 1; // OPEN
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;

    constructor(url: string) {
        this.url = url;
        wsInstances.push(this);
        // Do not auto-trigger onopen synchronously; let the test advance timers.
    }
    send = vi.fn();
    close = vi.fn();
}

describe("FEAT-0018: Exchange Adapter Conformance Suite", () => {
    beforeEach(() => {
        wsInstances = [];
        vi.stubGlobal('WebSocket', MockWebSocket);
        vi.useFakeTimers();

        accountState.reset();

        // Ensure capabilities and keys are present so private sockets connect
        settingsState.entitlement = {
            capabilities: { marketData: true }
        } as unknown as typeof settingsState.entitlement;
        settingsState.apiKeys = {
            bitunix: { key: "k", secret: "s" },
            bitget: { key: "k", secret: "s", passphrase: "p" }
        };
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    const injectWsMessage = (payload: Record<string, unknown>) => {
        wsInstances.forEach(ws => {
            if (ws.onmessage) {
                ws.onmessage({ data: JSON.stringify(payload) });
            }
        });
    };

    const injectWsMessageString = (payload: string) => {
        wsInstances.forEach(ws => {
            if (ws.onmessage) {
                ws.onmessage({ data: payload });
            }
        });
    };

    exchangeAdapters.forEach((adapter) => {
        describe(`Adapter: ${adapter.id}`, () => {
            beforeEach(async () => {
                settingsState.apiProvider = adapter.id;
                
                if (adapter.id === 'bitunix') {
                    // @ts-expect-error bypass private visibility for test
                    bitunixWs.connect(true);
                } else {
                    // @ts-expect-error bypass private visibility for test
                    bitgetWs.connect(true);
                }
                
                await vi.advanceTimersByTimeAsync(100);
                
                // Trigger onopen for all sockets
                wsInstances.forEach(ws => {
                    if (ws.onopen) ws.onopen();
                });
                
                // If bitget, simulate login success so it subscribes to private channels
                if (adapter.id === 'bitget') {
                    injectWsMessage({ event: "login", code: "00000" });
                }
            });

            it("should preserve 19-digit order IDs unrounded", async () => {
                const LARGE_ID = "1234567890123456789";
                
                if (adapter.id === "bitget") {
                    injectWsMessage({
                        action: "snapshot", arg: { instType: "mc", channel: "orders", instId: "BTCUSDT_UMCBL" },
                        data: [{
                            instId: "BTCUSDT_UMCBL",
                            orderId: LARGE_ID, // Bitget sends it as string usually, but we test the pipeline
                            status: "new",
                            accFillSize: "0",
                            price: "50000"
                        }]
                    });
                } else if (adapter.id === "bitunix") {
                    // Bitunix can send large numeric IDs
                    injectWsMessageString(`{
                        "ch": "order",
                        "data": [{
                            "orderId": ${LARGE_ID},
                            "symbol": "BTCUSDT",
                            "side": "BUY",
                            "type": "LIMIT",
                            "price": "50000",
                            "qty": "1",
                            "dealAmount": "0",
                            "orderStatus": "NEW"
                        }]
                    }`);
                }

                expect(accountState.openOrders).toHaveLength(1);
                expect(accountState.openOrders[0].orderId).toBe(LARGE_ID);
            });

            it("should normalise positions correctly and protect against missing qty (BUG-0001)", async () => {
                if (adapter.id === "bitget") {
                    // Initial position push with qty (total)
                    injectWsMessage({
                        action: "snapshot", arg: { instType: "mc", channel: "positions", instId: "BTCUSDT_UMCBL" },
                        data: [{
                            instId: "BTCUSDT_UMCBL",
                            total: "1.5",
                            openPriceAvg: "50000",
                            marginMode: "cross",
                            leverage: "10",
                            unrealizedPL: "100",
                            holdSide: "long"
                        }]
                    });

                    expect(accountState.positions).toHaveLength(1);
                    expect(accountState.positions[0].size.toString()).toBe("1.5");

                    // Subsequent push without qty (e.g. margin/pnl update)
                    injectWsMessage({
                        action: "snapshot", arg: { instType: "mc", channel: "positions", instId: "BTCUSDT_UMCBL" },
                        data: [{
                            instId: "BTCUSDT_UMCBL",
                            unrealizedPL: "150"
                        }]
                    });

                    // Qty should still be 1.5, not closed (0)
                    expect(accountState.positions).toHaveLength(1);
                    expect(accountState.positions[0].size.toString()).toBe("1.5");
                    expect(accountState.positions[0].unrealizedPnl.toString()).toBe("150");
                } else if (adapter.id === "bitunix") {
                    // Initial position push with qty
                    injectWsMessage({
                        ch: "position",
                        data: [{
                            positionId: "BTCUSDT",
                            symbol: "BTCUSDT",
                            qty: "1.5",
                            side: "long",
                            averagePrice: "50000",
                            leverage: "10",
                            unrealizedPNL: "100",
                            marginMode: "cross"
                        }]
                    });

                    expect(accountState.positions).toHaveLength(1);
                    expect(accountState.positions[0].size.toString()).toBe("1.5");

                    // Subsequent push without qty
                    injectWsMessage({
                        ch: "position",
                        data: [{
                            positionId: "BTCUSDT",
                            symbol: "BTCUSDT",
                            unrealizedPNL: "150"
                        }]
                    });

                    // Qty should still be 1.5
                    expect(accountState.positions).toHaveLength(1);
                    expect(accountState.positions[0].size.toString()).toBe("1.5");
                    expect(accountState.positions[0].unrealizedPnl.toString()).toBe("150");
                }
            });
        });
    });
});
