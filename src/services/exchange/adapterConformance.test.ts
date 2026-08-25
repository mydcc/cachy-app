import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { exchangeAdapters } from "./registry";
import { accountState } from "../../stores/account.svelte";
import { settingsState } from "../../stores/settings.svelte";
import { bitgetWs } from "../bitgetWs";
import { bitunixWs } from "../bitunixWs";
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
    close = vi.fn();
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
                
                // Initialize the correct singleton dynamically
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
                // (Bitunix connects private socket seamlessly)
                if (adapter.id === 'bitget') {
                    injectWsMessageString(JSON.stringify({ event: "login", code: "00000" }));
                }
            });

            it("should preserve 19-digit order IDs unrounded", async () => {
                const LARGE_ID = "1234567890123456789";
                
                const payload = loadFixture(adapter.id, 'order');
                injectWsMessageString(payload);

                expect(accountState.openOrders).toHaveLength(1);
                // Assert that the parsed order ID matches the exact string without JS number truncation
                expect(accountState.openOrders[0].orderId).toBe(LARGE_ID);
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
            });
        });
    });
});
