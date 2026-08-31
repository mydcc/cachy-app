import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { exchangeAdapters } from "./registry";
import { adapterTestHarnesses } from "./adapterConformance.harness";
import { accountState } from "../../stores/account.svelte";
import { settingsState } from "../../stores/settings.svelte";
import fs from "fs";
import path from "path";

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
    }
    send = vi.fn();
    close = vi.fn(() => {
        this.readyState = 3; // CLOSED
        if (this.onclose) this.onclose();
    });
}

describe("FEAT-0018: Exchange Adapter Conformance Suite", () => {
    beforeEach(() => {
        wsInstances = [];
        vi.stubGlobal('WebSocket', MockWebSocket);
        vi.useFakeTimers();

        accountState.reset();

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

    const injectWsMessageString = (payload: string) => {
        wsInstances.forEach(ws => {
            if (ws.onmessage) {
                ws.onmessage({ data: payload });
            }
        });
    };

    const loadFixture = (adapterId: string, fixtureName: string): string => {
        const fixturePath = path.join(__dirname, '__fixtures__', adapterId, `${fixtureName}.json`);
        return fs.readFileSync(fixturePath, 'utf8');
    };

    exchangeAdapters.forEach((adapter) => {
        describe(`Adapter: ${adapter.id}`, () => {
            beforeEach(async () => {
                settingsState.apiProvider = adapter.id;

                // Drive the transport exclusively through the harness — no
                // adapter-specific branching, so a new adapter only adds a
                // harness entry plus fixtures (FEAT-0018 AC).
                const harness = adapterTestHarnesses[adapter.id];
                harness.connect(true);

                await vi.advanceTimersByTimeAsync(100);

                // Trigger onopen for all sockets
                wsInstances.forEach(ws => {
                    if (ws.onopen) ws.onopen();
                });

                // Feed the login-success frame the adapter expects (no-op for
                // adapters that log in autonomously).
                harness.simulateLogin(injectWsMessageString);
            });

            it("should preserve 19-digit order IDs unrounded", async () => {
                const LARGE_ID = "1234567890123456789";
                
                const payload = loadFixture(adapter.id, 'order');
                injectWsMessageString(payload);

                expect(accountState.openOrders).toHaveLength(1);
                // Assert that the parsed order ID matches the exact string without JS number truncation
                expect(accountState.openOrders[0].orderId).toBe(LARGE_ID);
                
                // Assert other mapped fields based on the fixture contents
                expect(accountState.openOrders[0].side).toBe("buy");
                expect(accountState.openOrders[0].type).toBe("limit");
                expect(accountState.openOrders[0].status.toLowerCase()).toBe("new");
                expect(accountState.openOrders[0].amount.toString()).toMatch(/^(1|0\.012)$/);
                expect(accountState.openOrders[0].filled.toString()).toBe("0");
            });

            it("should normalise positions correctly and protect against missing qty (BUG-0001)", async () => {
                const positionPayload = loadFixture(adapter.id, 'position');
                injectWsMessageString(positionPayload);

                expect(accountState.positions).toHaveLength(1);
                expect(accountState.positions[0].size.toString()).toBe("1.5");

                const positionUpdatePayload = loadFixture(adapter.id, 'position_update');
                injectWsMessageString(positionUpdatePayload);

                // BUG-0001 Protection: The missing quantity field in the update should NOT clear the position size to 0
                expect(accountState.positions).toHaveLength(1);
                expect(accountState.positions[0].size.toString()).toBe("1.5");
                expect(accountState.positions[0].unrealizedPnl.toString()).toBe("150");
                
                // Assert full normalization
                expect(accountState.positions[0].side).toBe("long");
                expect(accountState.positions[0].leverage.toString()).toBe("10");
                expect(accountState.positions[0].marginMode).toMatch(/^(cross|crossed)$/);
                expect(accountState.positions[0].entryPrice.toString()).toBe("50000");
            });

            it("should preserve precision for small prices", async () => {
                const payload = loadFixture(adapter.id, 'order_small_price');
                injectWsMessageString(payload);

                expect(accountState.openOrders).toHaveLength(1);
                expect(accountState.openOrders[0].price.toFixed()).toBe("0.00000000123456789");
            });

            it("should deduplicate WebSocket updates", async () => {
                const payload = loadFixture(adapter.id, 'order');
                injectWsMessageString(payload);
                injectWsMessageString(payload); // Duplicate message

                expect(accountState.openOrders).toHaveLength(1);
            });

            it("should resubscribe to channels on reconnect", async () => {
                const harness = adapterTestHarnesses[adapter.id];
                const initialSocket = wsInstances[wsInstances.length - 1];
                initialSocket.send.mockClear();

                // Make navigator online so it actually reconnects instead of waiting
                vi.stubGlobal('navigator', { onLine: true });

                // Trigger a socket close
                initialSocket.close();

                // Fast-forward past the reconnect backoff (harness-owned constant)
                await vi.advanceTimersByTimeAsync(harness.reconnectBackoffMs);

                // The harness returns the adapter's new private socket after reconnect
                const newSocket = harness.getPrivateSocket();

                expect(newSocket).not.toBe(initialSocket);

                if (newSocket?.onopen) newSocket.onopen();

                // Simulate login success so it subscribes to private channels
                injectWsMessageString(JSON.stringify({ event: "login", code: "00000", msg: "success" }));

                // Check that subscriptions were replayed
                expect(newSocket!.send).toHaveBeenCalled();
            });

            it("should clear held subscriptions when connection is destroyed", () => {
                const harness = adapterTestHarnesses[adapter.id];
                adapter.marketData.subscribe("BTCUSDT", "ticker");
                expect(harness.getSubscriptionCount()).toBeGreaterThan(0);

                adapter.connection.destroy();

                expect(harness.getSubscriptionCount()).toBe(0);
            });
        });
    });
});
