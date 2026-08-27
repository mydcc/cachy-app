/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { accountState } from "../stores/account.svelte";
import { bitgetWs } from "./bitgetWs";

interface BitgetWSService {
  isAuthenticated: boolean;
  handleMessage(message: Record<string, unknown>): void;
  normalizeOrderData(order: Record<string, string | undefined>): Record<string, unknown>;
  normalizePositionData(position: Record<string, string | undefined>): Record<string, unknown>;
}

describe("Bitget WebSocket", () => {
  beforeEach(() => {
    // Clear account state before each test
    accountState.reset();
    // Reset authentication state on the singleton
    const wsService = bitgetWs as unknown as BitgetWSService;
    wsService.isAuthenticated = false;
  });

  describe("Login authentication", () => {
    it("should authenticate on login acknowledgement with event=login and code=00000", () => {
      // Create a minimal Bitget instance to access private handleMessage
      const wsService = bitgetWs as unknown as BitgetWSService;
      wsService.isAuthenticated = false;

      const message = {
        event: "login",
        code: "00000"
      };

      // Call the private handleMessage method via reflection
      wsService.handleMessage(message);
      expect(wsService.isAuthenticated).toBe(true);
    });

    it("should not authenticate on login failure with code 30001", () => {
      const wsService = bitgetWs as unknown as BitgetWSService;
      wsService.isAuthenticated = false;

      const message = {
        event: "login",
        code: "30001"
      };

      wsService.handleMessage(message);
      expect(wsService.isAuthenticated).toBe(false);
    });
  });

  describe("Position updates normalization", () => {
    it("should add a position from Bitget WS payload with correct field mapping", () => {
      const wsService = bitgetWs as unknown as BitgetWSService;

      // Simulate a Bitget position push message
      const message = {
        action: "snapshot",
        arg: {
          channel: "positions",
          instId: "default",
          instType: "mc"
        },
        data: [
          {
            instId: "BTCUSDT_UMCBL",
            total: "1.5",
            openPriceAvg: "50000",
            marginMode: "crossed",
            leverage: "10",
            unrealizedPL: "500.25",
            holdSide: "long"
          }
        ]
      };

      // First authenticate
      wsService.isAuthenticated = true;

      // Process the position update
      wsService.handleMessage(message);

      // Verify position was added with correct data
      expect(accountState.positions.length).toBe(1);
      const position = accountState.positions[0];
      expect(position.symbol).toBe("BTCUSDT_UMCBL");
      expect(position.size.toFixed(1)).toBe("1.5");
      expect(position.entryPrice.toFixed(0)).toBe("50000");
      expect(position.marginMode).toBe("crossed");
      expect(position.leverage.toFixed(0)).toBe("10");
      expect(position.unrealizedPnl.toFixed(2)).toBe("500.25");
      expect(position.side).toBe("long");
    });

    it("should handle multiple positions without overwriting", () => {
      const wsService = bitgetWs as unknown as BitgetWSService;
      wsService.isAuthenticated = true;

      // Add first position
      const message1 = {
        action: "snapshot",
        arg: {
          channel: "positions",
          instId: "default",
          instType: "mc"
        },
        data: [
          {
            instId: "BTCUSDT_UMCBL",
            total: "1.0",
            openPriceAvg: "50000",
            marginMode: "crossed",
            leverage: "10",
            unrealizedPL: "100",
            holdSide: "long"
          }
        ]
      };

      wsService.handleMessage(message1);
      expect(accountState.positions.length).toBe(1);

      // Add second position with different symbol
      const message2 = {
        action: "snapshot",
        arg: {
          channel: "positions",
          instId: "default",
          instType: "mc"
        },
        data: [
          {
            instId: "ETHUSDT_UMCBL",
            total: "2.0",
            openPriceAvg: "2000",
            marginMode: "crossed",
            leverage: "5",
            unrealizedPL: "200",
            holdSide: "short"
          }
        ]
      };

      wsService.handleMessage(message2);

      // Both positions should exist
      expect(accountState.positions.length).toBe(2);

      const btcPos = accountState.positions.find(p => p.symbol === "BTCUSDT_UMCBL");
      const ethPos = accountState.positions.find(p => p.symbol === "ETHUSDT_UMCBL");

      expect(btcPos).toBeDefined();
      expect(ethPos).toBeDefined();
      expect(btcPos?.size.toFixed(1)).toBe("1.0");
      expect(ethPos?.size.toFixed(1)).toBe("2.0");
      expect(btcPos?.side).toBe("long");
      expect(ethPos?.side).toBe("short");
    });
  });

  describe("Order updates normalization", () => {
    it("should add an order from Bitget WS payload with correct field mapping", () => {
      const wsService = bitgetWs as unknown as BitgetWSService;
      wsService.isAuthenticated = true;

      const message = {
        action: "snapshot",
        arg: {
          channel: "orders",
          instId: "default",
          instType: "mc"
        },
        data: [
          {
            orderId: "order123",
            instId: "BTCUSDT_UMCBL",
            status: "live",
            price: "51000",
            accFillSize: "0.5"
          }
        ]
      };

      wsService.handleMessage(message);

      expect(accountState.openOrders.length).toBe(1);
      const order = accountState.openOrders[0];
      expect(order.orderId).toBe("order123");
      expect(order.symbol).toBe("BTCUSDT_UMCBL");
      expect(order.status).toBe("live");
      expect(order.price.toFixed(0)).toBe("51000");
      expect(order.filled.toFixed(1)).toBe("0.5");
    });
  });

  describe("Field name mapping", () => {
    it("should correctly map Bitget position fields to internal format", () => {
      const wsService = bitgetWs as unknown as BitgetWSService;

      const bitgetPosition = {
        instId: "BTCUSDT_UMCBL",
        total: "1.5",
        openPriceAvg: "50000",
        marginMode: "crossed",
        leverage: "10",
        unrealizedPL: "500.25",
        holdSide: "long"
      };

      const normalized = wsService.normalizePositionData(bitgetPosition);

      // Check that all expected fields are mapped
      expect(normalized.symbol).toBe("BTCUSDT_UMCBL");
      expect(normalized.qty).toBe("1.5");
      expect(normalized.averagePrice).toBe("50000");
      expect(normalized.avgOpenPrice).toBe("50000");
      expect(normalized.marginMode).toBe("crossed");
      expect(normalized.leverage).toBe("10");
      expect(normalized.unrealizedPNL).toBe("500.25");
      expect(normalized.side).toBe("long");
    });

    it("should correctly map Bitget order fields to internal format", () => {
      const wsService = bitgetWs as unknown as BitgetWSService;

      const bitgetOrder = {
        orderId: "order123",
        instId: "BTCUSDT_UMCBL",
        status: "live",
        price: "51000",
        accFillSize: "0.5"
      };

      const normalized = wsService.normalizeOrderData(bitgetOrder);

      expect(normalized.orderId).toBe("order123");
      expect(normalized.symbol).toBe("BTCUSDT_UMCBL");
      expect(normalized.orderStatus).toBe("live");
      expect(normalized.price).toBe("51000");
      expect(normalized.qty).toBe("0.5");
      expect(normalized.dealAmount).toBe("0.5");
    });
  });
});
