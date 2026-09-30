/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { accountState } from "../stores/account.svelte";
import { bitgetWs } from "./bitgetWs";
import { logger } from "./logger";

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

  afterEach(() => {
    vi.restoreAllMocks();
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

    it("should authenticate on login acknowledgement with code=0 (vendor WS spelling, BUG-0581)", () => {
      const wsService = bitgetWs as unknown as BitgetWSService;
      wsService.isAuthenticated = false;

      wsService.handleMessage({ event: "login", code: "0" });
      expect(wsService.isAuthenticated).toBe(true);
    });

    it("should authenticate on login acknowledgement with numeric code 0 (BUG-0581)", () => {
      const wsService = bitgetWs as unknown as BitgetWSService;
      wsService.isAuthenticated = false;

      wsService.handleMessage({ event: "login", code: 0 });
      expect(wsService.isAuthenticated).toBe(true);
    });

    it("should not call subscribePrivate on login failure (BUG-0581)", () => {
      const wsService = bitgetWs as unknown as BitgetWSService;
      wsService.isAuthenticated = false;
      const spy = vi.spyOn(wsService as unknown as Record<string, () => void>, "subscribePrivate");

      wsService.handleMessage({ event: "login", code: "30001" });

      expect(wsService.isAuthenticated).toBe(false);
      expect(spy).not.toHaveBeenCalled();
    });

    it("should log an unrecognized login code loudly instead of dropping it (BUG-0581)", () => {
      const wsService = bitgetWs as unknown as BitgetWSService;
      wsService.isAuthenticated = false;
      const spy = vi.spyOn(logger, "warn");

      wsService.handleMessage({ event: "login", code: "99999" });

      expect(wsService.isAuthenticated).toBe(false);
      expect(spy).toHaveBeenCalledWith("network", expect.stringContaining("99999"), expect.anything());
    });
  });

});
