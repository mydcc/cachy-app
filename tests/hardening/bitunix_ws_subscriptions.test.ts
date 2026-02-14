import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bitunixWs } from '../../src/services/bitunixWs';

describe('BitunixWs Hardening', () => {
  beforeEach(() => {
    (bitunixWs as any).pendingSubscriptions.clear();
    // Reset mock
    (bitunixWs as any).wsPublic = {
        readyState: 1, // OPEN
        send: vi.fn()
    };
  });

  it('correctly parses keys with colons in flushPendingSubscriptions (Fix Verified)', () => {
    const mockSend = (bitunixWs as any).wsPublic.send;

    const symbolWithColon = "BTC:USDT";
    const channel = "price";
    const key1 = `${channel}:${symbolWithColon}`;

    (bitunixWs as any).pendingSubscriptions.set(key1, 1);

    (bitunixWs as any).flushPendingSubscriptions();

    // Expectation: It splits "price:BTC:USDT" -> channel="price", symbol="BTC:USDT".
    // It calls sendSubscribe("BTC:USDT", "price").

    expect(mockSend).toHaveBeenCalledWith(expect.stringContaining('"symbol":"BTC:USDT"'));
    expect(mockSend).toHaveBeenCalledWith(expect.stringContaining('"ch":"price"'));
  });
});
