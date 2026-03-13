// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Decimal } from 'decimal.js';

// Setup browser mock environment
vi.mock('$app/environment', () => ({ browser: true }));

describe('AccountManager Memory Pruning', () => {
  let accountState: any;

  beforeEach(async () => {
    vi.resetModules();
    const module = await import('./account.svelte');
    accountState = module.accountState;
    accountState.reset();
  });

  it('safely prunes old closed orders while keeping open ones', () => {
    // Generate 150 closed orders
    for (let i = 0; i < 150; i++) {
        accountState.openOrders.push({
            orderId: `closed-order-${i}`,
            symbol: "BTCUSDT",
            side: "buy",
            type: "limit",
            price: new Decimal(50000),
            amount: new Decimal(1),
            filled: new Decimal(1),
            status: "FILLED", // Closed status
            timestamp: Date.now() - (i * 1000) // Ensure chronological difference
        });
    }

    // Generate 10 open orders
    for (let i = 0; i < 10; i++) {
        accountState.openOrders.push({
            orderId: `open-order-${i}`,
            symbol: "BTCUSDT",
            side: "buy",
            type: "limit",
            price: new Decimal(50000),
            amount: new Decimal(1),
            filled: new Decimal(0),
            status: "NEW", // Open status
            timestamp: Date.now()
        });
    }

    expect(accountState.openOrders.length).toBe(160);

    // Trigger pruning
    accountState.pruneOldData();

    // Should keep 10 open + 100 most recent closed = 110
    expect(accountState.openOrders.length).toBe(110);

    // Verify all open orders are still there
    const openOrders = accountState.openOrders.filter((o: any) => o.status === "NEW");
    expect(openOrders.length).toBe(10);

    // Verify only 100 closed orders exist
    const closedOrders = accountState.openOrders.filter((o: any) => o.status === "FILLED");
    expect(closedOrders.length).toBe(100);
  });
});
