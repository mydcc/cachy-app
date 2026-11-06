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

/*
 * FEAT-0803 — the panel labels the pivot levels with the candle they were
 * computed from. `pivotBasis` carries H/L/C but no timestamp, so the time is
 * read back out of the series by matching those three values. These tests pin
 * that match: exact enough to identify the bar, tolerant enough to survive a
 * different computation path, and honest enough to return nothing rather than
 * the wrong bar.
 */

import { describe, expect, it } from "vitest";
import { findBasisCandleTime, type PivotCandleLike } from "./pivotBasis";

const T0 = 1_700_000_000_000;
const HOUR = 3_600_000;

interface Bar extends PivotCandleLike {
  open: number;
  time: number;
}

function bar(index: number, open: number, high: number, low: number, close: number): Bar {
  return { open, high, low, close, time: T0 + index * HOUR };
}

/** Two closed bars, then the forming one — the shape the calculator assumes. */
function series(): Bar[] {
  return [
    bar(0, 98.0, 99.0, 97.5, 98.5),
    bar(1, 100.1, 100.4, 100.0, 100.3),
    bar(2, 100.3, 100.5, 100.2, 100.4),
  ];
}

describe("findBasisCandleTime", () => {
  it("returns the second-newest bar, the one the calculator derived the levels from", () => {
    const basis = { high: 100.4, low: 100.0, close: 100.3 };

    expect(findBasisCandleTime(series(), basis)).toBe(T0 + HOUR);
  });

  it("matches a basis that differs from the series in the last bits", () => {
    const candles = series();
    // Same bar, recomputed on a different path: one bit of f64 noise per value.
    const basis = {
      high: 100.4 * (1 + 1e-15),
      low: 100.0 * (1 - 1e-15),
      close: 100.3 * (1 + 1e-15),
    };

    expect(findBasisCandleTime(candles, basis)).toBe(T0 + HOUR);
  });

  it("returns null once the series no longer holds the basis candle", () => {
    const basis = { high: 100.4, low: 100.0, close: 100.3 };
    const replaced = [bar(0, 101, 102, 100, 101.5), bar(1, 101.5, 102, 101, 101.8)];

    expect(findBasisCandleTime(replaced, basis)).toBeNull();
  });

  it("does not match a bar further back than the lookback", () => {
    const basis = { high: 100.4, low: 100.0, close: 100.3 };
    const stale = [bar(0, 100.1, 100.4, 100.0, 100.3)];
    for (let index = 1; index < 10; index++) {
      stale.push(bar(index, 110, 111, 109, 110.5));
    }

    expect(findBasisCandleTime(stale, basis)).toBeNull();
    expect(findBasisCandleTime(stale, basis, 20)).toBe(T0);
  });

  it("refuses a basis value that is not a finite number", () => {
    const basis = { high: Number.NaN, low: 100.0, close: 100.3 };

    expect(findBasisCandleTime(series(), basis)).toBeNull();
  });
});
