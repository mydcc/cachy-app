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

});
