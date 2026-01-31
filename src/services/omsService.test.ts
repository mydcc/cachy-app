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


import { describe, it, expect, beforeEach, vi } from 'vitest';
import { omsService } from './omsService';
import type { OMSOrder } from './omsTypes';
import Decimal from 'decimal.js';

describe('OrderManagementSystem', () => {
  // Access private methods/properties via any cast for testing internals
  const oms = omsService as any;

  beforeEach(() => {
    // Reset state
    oms.orders.clear();
    oms.positions.clear();
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

    expect(oms.orders.size).toBe(limit);
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
    oms.orders.clear();

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

    expect(oms.orders.size).toBe(limit);
    expect(oms.orders.has('finalized-1')).toBe(true);

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
    expect(oms.orders.size).toBe(limit);
    expect(oms.orders.has('finalized-1')).toBe(false);
    expect(oms.orders.has('overflow-1')).toBe(true);
  });

  it('should evict oldest active order if no finalized orders exist (Ring Buffer)', () => {
    oms.orders.clear();
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
    expect(oms.orders.size).toBe(limit);
    expect(oms.orders.has('active-0')).toBe(false);
    expect(oms.orders.has('overflow-active')).toBe(true);
  });
});
