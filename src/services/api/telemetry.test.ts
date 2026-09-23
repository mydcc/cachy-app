/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * Ports for the api/* modules (FEAT-0342): the request stack reads store
 * state through these instead of importing stores (architecture boundary).
 */
import { describe, it, expect, vi } from "vitest";
import {
  setRequestTelemetrySink,
  getRequestTelemetrySink,
  setNetworkLogProvider,
  isNetworkLoggingEnabled,
} from "./telemetry";
import { requestManager } from "./requestManager";

describe("api telemetry ports", () => {
  it("defaults to a silent no-op sink and disabled network logs", () => {
    setRequestTelemetrySink(null);
    setNetworkLogProvider(() => false);
    expect(getRequestTelemetrySink()).toBeNull();
    expect(isNetworkLoggingEnabled()).toBe(false);
  });

  it("forwards telemetry from a scheduled request to the installed sink", async () => {
    const recordApiCall = vi.fn();
    const updateTelemetry = vi.fn();
    setRequestTelemetrySink({ recordApiCall, updateTelemetry });
    setNetworkLogProvider(() => false);

    const result = await requestManager.schedule("PORT-TEST", async () => 42);

    expect(result).toBe(42);
    expect(recordApiCall).toHaveBeenCalledTimes(1);
    expect(updateTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({ apiLatency: expect.any(Number) }),
    );

    setRequestTelemetrySink(null);
  });

  it("reflects the installed network-log provider", () => {
    setNetworkLogProvider(() => true);
    expect(isNetworkLoggingEnabled()).toBe(true);
    setNetworkLogProvider(() => {
      throw new Error("boom");
    });
    expect(isNetworkLoggingEnabled()).toBe(false);
    setNetworkLogProvider(() => false);
  });
});
