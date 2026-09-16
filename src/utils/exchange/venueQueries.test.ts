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

import { describe, it, expect } from "vitest";
import {
  buildPositionsHistoryQueryParams,
  buildSyncQueryParams,
} from "./venueQueries";

describe("buildPositionsHistoryQueryParams", () => {
  it("defaults to 50 when no limit is given", () => {
    expect(buildPositionsHistoryQueryParams({})).toEqual({ limit: "50" });
  });

  it("passes through a venue-valid page size unchanged", () => {
    expect(buildPositionsHistoryQueryParams({ limit: 10 })).toEqual({ limit: "10" });
  });

  it("clamps to the venue ceiling of 100", () => {
    // The venue documents Maximum: 100 — an out-of-spec page size is either
    // rejected (loud sync failure) or silently capped (quiet journal gap),
    // so the shared builder holds both sides to the ceiling instead.
    expect(buildPositionsHistoryQueryParams({ limit: 500 })).toEqual({ limit: "100" });
  });

  it("clamps a non-positive limit up to 1", () => {
    expect(buildPositionsHistoryQueryParams({ limit: 0 })).toEqual({ limit: "1" });
  });

  it("falls back to the default on NaN", () => {
    expect(buildPositionsHistoryQueryParams({ limit: NaN })).toEqual({ limit: "50" });
  });

  it("agrees with buildSyncQueryParams on the shared ceiling", () => {
    expect(buildSyncQueryParams({ limit: 500 }).limit).toBe("100");
  });
});
