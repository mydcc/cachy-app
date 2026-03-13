// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Decimal } from 'decimal.js';

// Setup browser mock environment
vi.mock('$app/environment', () => ({ browser: true }));

describe('AccountManager Data Integrity', () => {
  let accountState: any;

  beforeEach(async () => {
    vi.resetModules();
    const module = await import('./account.svelte');
    accountState = module.accountState;
    accountState.reset();
  });

  it('safely handles invalid decimal properties in updateOrderFromWs', () => {
    // Inject invalid WebSocket payload (NaN, strings, undefined)
    accountState.updateOrderFromWs({
      orderId: "invalid-order-1",
      symbol: "BTCUSDT",
      side: "buy",
      type: "limit",
      price: "invalid_price",
      qty: "invalid_qty",
      dealAmount: "NaN",
      orderStatus: "NEW"
    });

    expect(accountState.openOrders.length).toBe(1);

    const order = accountState.openOrders[0];
    // Check that we safely handled the invalid numbers and fell back to valid Decimals (e.g. 0)
    expect(order.price.isFinite() && !order.price.isNaN()).toBe(true);
    expect(order.amount.isFinite() && !order.amount.isNaN()).toBe(true);
    expect(order.filled.isFinite() && !order.filled.isNaN()).toBe(true);
    expect(order.price.toNumber()).toBe(0);
    expect(order.amount.toNumber()).toBe(0);
  });

  it('safely handles invalid decimal properties in updatePositionFromWs', () => {
    // Note: If qty parses as an invalid number, safeDecimal uses fallback (new Decimal(0))
    // which triggers the isClose condition. To test the fallback of other fields during an OPEN/UPDATE,
    // we must provide a valid non-zero qty.
    accountState.updatePositionFromWs({
      positionId: "invalid-pos-1",
      symbol: "BTCUSDT",
      side: "long",
      qty: "1.5", // valid so it's not treated as CLOSE
      averagePrice: "invalid_price",
      leverage: "NaN",
      unrealizedPNL: "invalid_pnl",
      margin: "invalid_margin"
    });

    expect(accountState.positions.length).toBe(1);

    const pos = accountState.positions[0];
    expect(pos.size.isFinite() && !pos.size.isNaN()).toBe(true);
    expect(pos.entryPrice.isFinite() && !pos.entryPrice.isNaN()).toBe(true);
    expect(pos.leverage.isFinite() && !pos.leverage.isNaN()).toBe(true);
    expect(pos.unrealizedPnl.isFinite() && !pos.unrealizedPnl.isNaN()).toBe(true);
    expect(pos.size.toNumber()).toBe(1.5); // Assert the valid non-zero
    expect(pos.entryPrice.toNumber()).toBe(0); // Assert the fallback for invalid string
  });
});
