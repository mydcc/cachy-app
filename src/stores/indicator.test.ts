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

import { describe, it, expect } from "vitest";
import { indicatorState } from "./indicator.svelte";

describe("IndicatorManager.toJSON", () => {
  it("returns a fresh clone on every call", () => {
    // Arrange + Act
    const first = indicatorState.toJSON();
    const second = indicatorState.toJSON();

    // Assert: equal content, independent identities (nested too)
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.rsi).not.toBe(second.rsi);
  });

  it("isolates store state from consumer mutations", () => {
    // Arrange
    const clone = indicatorState.toJSON();
    const originalLength = clone.rsi.length;

    // Act: mutate the handed-out clone (what subscribers do)
    clone.rsi.length = -1;
    (clone as unknown as Record<string, unknown>).extra = "pollution";

    // Assert: the store snapshot is unaffected
    const reread = indicatorState.toJSON();
    expect(reread.rsi.length).toBe(originalLength);
    expect(reread).not.toHaveProperty("extra");
  });

  it("matches structuredClone for the live payload", () => {
    // Guards the JSON.parse fast path: if a non-JSON value (Date, Map, Set,
    // BigInt) ever enters the snapshot, this fails loudly instead of
    // silently corrupting subscribers.
    const viaJson = indicatorState.toJSON();

    expect(viaJson).toEqual(structuredClone(viaJson));
  });

  it("documents JSON edge semantics for non-finite values", () => {
    // Arrange: NaN can enter the snapshot (update() does not validate numbers)
    const before = indicatorState.toJSON().rsi.length;
    indicatorState.update((s) => ({ ...s, rsi: { ...s.rsi, length: NaN } }));

    try {
      // Act + Assert: JSON round-trip normalizes NaN to null (structuredClone
      // would preserve NaN). Pinned so a future change flips consciously.
      expect(indicatorState.toJSON().rsi.length).toBeNull();
    } finally {
      // Cleanup: restore the singleton for the remaining tests
      indicatorState.update((s) => ({ ...s, rsi: { ...s.rsi, length: before } }));
    }

    expect(indicatorState.toJSON().rsi.length).toBe(before);
  });

  it("drops explicitly undefined optional fields", () => {
    // Arrange
    indicatorState.update((s) => ({ ...s, vwap: { ...s.vwap, anchorPoint: undefined } }));

    try {
      // Act + Assert: JSON.stringify drops undefined-valued keys while
      // structuredClone would keep them — pinned as documented behavior.
      const json = indicatorState.toJSON();
      expect("anchorPoint" in json.vwap).toBe(false);
    } finally {
      // Cleanup: remove the key again (was absent before)
      indicatorState.update((s) => {
        const { anchorPoint: _dropped, ...vwap } = s.vwap;
        return { ...s, vwap };
      });
    }
  });
});
