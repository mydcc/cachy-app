/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiService } from "./apiService";
import { Decimal } from "decimal.js";

// Mock logger
vi.mock("./logger", () => ({
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock RequestManager to execute immediately without queue logic overhead if possible,
// but mocking fetch is usually enough since RequestManager uses fetch.
// Actually, `apiService` imports `requestManager`. We might need to mock `requestManager.schedule`
// if we want to bypass the queue, but `apiService` calls it directly.
// Let's just mock global fetch.

global.fetch = vi.fn();

describe("ApiService - Kline Gap Reproduction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should silently drop invalid klines (Bug Reproduction)", async () => {
    // Mock response with 3 items: Valid, Invalid (NaN), Valid
    const mockResponse = [
      ["1700000000000", "50000", "50100", "49900", "50050", "1.5"], // Valid
      ["1700000060000", "NaN", "50200", "50000", "50100", "1.0"],   // Invalid Open
      ["1700000120000", "50100", "50300", "50050", "50200", "2.0"], // Valid
    ];

    // Setup fetch mock
    (global.fetch as any).mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      text: async () => JSON.stringify(mockResponse),
    });

    // Execute
    const klines = await apiService.fetchBitgetKlines("BTCUSDT", "1m");

    // Assert
    // We expect 2 items, meaning 1 was dropped silently
    expect(klines.length).toBe(2);
    expect(klines[0].time).toBe(1700000000000);
    expect(klines[1].time).toBe(1700000120000); // The middle one is gone

    // Verify NO warning was logged (Current behavior - Silent Failure)
    // Actually, we want to confirm it IS silently dropped.
    // If I fix it later to log, this test will need update.
    // For reproduction, proving the gap exists is enough.
  });
});
