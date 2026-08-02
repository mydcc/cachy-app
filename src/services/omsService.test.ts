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


import { describe, it, expect, beforeEach } from 'vitest';
import { omsService } from './omsService';
import type { OMSOrder } from './omsTypes';
import Decimal from 'decimal.js';

describe('OrderManagementSystem', () => {
  // Access private methods/properties via a typed cast for testing internals
  const oms = omsService as unknown as { MAX_ORDERS: number };

  beforeEach(() => {
    // Reset state
    omsService.reset();
  });

  it('should accept orders up to MAX_ORDERS', () => {
    const limit = oms.MAX_ORDERS;

    // Fill up to limit
    for (let i = 0; i < limit; i++) {
      const order: OMSOrder = {
        id: `ord-${i}`,
        symbol: 'BTCUSDT',
        side: 'buy',
        type: 'limit',
        price: new Decimal(50000),
        amount: new Decimal(1),
        filledAmount: new Decimal(0),
        status: 'pending',
        timestamp: Date.now()
      };
      omsService.updateOrder(order);
    }

    expect(omsService.getAllOrders().length).toBe(limit);
  });

  it('should evict oldest finalized order when full', () => {
    // 1. Fill with active orders
    const limit = oms.MAX_ORDERS;
    for (let i = 0; i < limit - 1; i++) {
      omsService.updateOrder({
        id: `active-${i}`,
        symbol: 'BTCUSDT',
        side: 'buy',
        type: 'limit',
        price: new Decimal(100),
        amount: new Decimal(1),
        filledAmount: new Decimal(0),
        status: 'pending',
        timestamp: Date.now()
      });
    }

    // 2. Add one finalized order (oldest effectively, if we insert it early, but here we insert at end)
    // Actually, Map preserves insertion order.
    // Let's clear and do: 1 finalized, then 1999 active.
    omsService.reset();

    const finalizedOrder: OMSOrder = {
        id: 'finalized-1',
        symbol: 'BTCUSDT',
        side: 'buy',
        type: 'limit',
        price: new Decimal(100),
        amount: new Decimal(1),
        filledAmount: new Decimal(1),
        status: 'filled',
        timestamp: Date.now()
    };
    omsService.updateOrder(finalizedOrder);

    for (let i = 0; i < limit - 1; i++) {
         omsService.updateOrder({
            id: `active-${i}`,
            symbol: 'BTCUSDT',
            side: 'buy',
            type: 'limit',
            price: new Decimal(100),
            amount: new Decimal(1),
            filledAmount: new Decimal(0),
            status: 'pending',
            timestamp: Date.now()
          });
    }

    expect(omsService.getAllOrders().length).toBe(limit);
    expect(omsService.getOrder('finalized-1')).toBeDefined();

    // 3. Add one more order (overflow)
    omsService.updateOrder({
        id: 'overflow-1',
        symbol: 'BTCUSDT',
        side: 'buy',
        type: 'limit',
        price: new Decimal(100),
        amount: new Decimal(1),
        filledAmount: new Decimal(0),
        status: 'pending',
        timestamp: Date.now()
    });

    // 4. Expect 'finalized-1' to be gone (Safe Prune)
    expect(omsService.getAllOrders().length).toBe(limit);
    expect(omsService.getOrder('finalized-1')).toBeUndefined();
    expect(omsService.getOrder('overflow-1')).toBeDefined();
  });

  it('should evict oldest active order if no finalized orders exist (Ring Buffer)', () => {
    omsService.reset();
    const limit = oms.MAX_ORDERS;

    // Fill with active orders
    for (let i = 0; i < limit; i++) {
        omsService.updateOrder({
            id: `active-${i}`,
            symbol: 'BTCUSDT',
            side: 'buy',
            type: 'limit',
            price: new Decimal(100),
            amount: new Decimal(1),
            filledAmount: new Decimal(0),
            status: 'pending',
            timestamp: Date.now()
        });
    }

    // Add overflow
    omsService.updateOrder({
        id: 'overflow-active',
        symbol: 'BTCUSDT',
        side: 'buy',
        type: 'limit',
        price: new Decimal(100),
        amount: new Decimal(1),
        filledAmount: new Decimal(0),
        status: 'pending',
        timestamp: Date.now()
    });

    // Expect 'active-0' (first inserted) to be gone
    expect(omsService.getAllOrders().length).toBe(limit);
    expect(omsService.getOrder('active-0')).toBeUndefined();
    expect(omsService.getOrder('overflow-active')).toBeDefined();
  });

  it('should protect recently inserted orders from eviction (PRESERVE_LATEST)', () => {
    // BUG-0003 fix: just-inserted orders should not be evicted immediately
    omsService.reset();
    const limit = oms.MAX_ORDERS;
    const PRESERVE_LATEST = 20;

    // Fill close to limit (limit - PRESERVE_LATEST)
    for (let i = 0; i < limit - PRESERVE_LATEST; i++) {
        omsService.updateOrder({
            id: `old-${i}`,
            symbol: 'BTCUSDT',
            side: 'buy',
            type: 'limit',
            price: new Decimal(100),
            amount: new Decimal(1),
            filledAmount: new Decimal(0),
            status: 'pending',
            timestamp: Date.now() - 1000 // older timestamp
        });
    }

    // Add PRESERVE_LATEST recent orders (should be protected)
    const recentOrderIds: string[] = [];
    for (let i = 0; i < PRESERVE_LATEST; i++) {
        const id = `recent-${i}`;
        recentOrderIds.push(id);
        omsService.updateOrder({
            id,
            symbol: 'BTCUSDT',
            side: 'buy',
            type: 'limit',
            price: new Decimal(100),
            amount: new Decimal(1),
            filledAmount: new Decimal(0),
            status: 'pending',
            timestamp: Date.now() // recent timestamp
        });
    }

    // Now we are exactly at limit + PRESERVE_LATEST
    expect(omsService.getAllOrders().length).toBe(limit);

    // Add one more order (overflow) - force eviction
    const newOrderId = 'just-inserted';
    omsService.updateOrder({
        id: newOrderId,
        symbol: 'BTCUSDT',
        side: 'buy',
        type: 'limit',
        price: new Decimal(100),
        amount: new Decimal(1),
        filledAmount: new Decimal(0),
        status: 'pending',
        timestamp: Date.now()
    });

    // Expect just-inserted order to survive (it's in PRESERVE_LATEST)
    expect(omsService.getOrder(newOrderId)).toBeDefined();
    // Expect one of the old orders to be gone instead
    expect(omsService.getOrder('old-0')).toBeUndefined();
    // Expect map to be bounded at MAX_ORDERS
    expect(omsService.getAllOrders().length).toBe(limit);
  });

  it('should keep map bounded even under sustained overflow', () => {
    // BUG-0003: ensure map doesn't grow unbounded
    omsService.reset();
    const limit = oms.MAX_ORDERS;

    // Add limit orders
    for (let i = 0; i < limit; i++) {
        omsService.updateOrder({
            id: `order-${i}`,
            symbol: 'BTCUSDT',
            side: 'buy',
            type: 'limit',
            price: new Decimal(100),
            amount: new Decimal(1),
            filledAmount: new Decimal(0),
            status: 'pending',
            timestamp: Date.now()
        });
    }

    // Sustained overflows - add 100 more orders
    for (let i = 0; i < 100; i++) {
        omsService.updateOrder({
            id: `overflow-${i}`,
            symbol: 'BTCUSDT',
            side: 'buy',
            type: 'limit',
            price: new Decimal(100),
            amount: new Decimal(1),
            filledAmount: new Decimal(0),
            status: 'pending',
            timestamp: Date.now()
        });

        // Map must never exceed MAX_ORDERS
        expect(omsService.getAllOrders().length).toBeLessThanOrEqual(limit);
    }

    // After all overflows, map should be at exactly MAX_ORDERS
    expect(omsService.getAllOrders().length).toBe(limit);
  });
});
