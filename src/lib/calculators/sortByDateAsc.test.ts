// Copyright (C) 2026 MYDCT
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import { describe, it, expect } from "vitest";
import { sortByDateAsc, toEpochMs } from "./core";

interface Row {
  id: string;
  date: string;
}

const row = (id: string, date: string): Row => ({ id, date });

describe("toEpochMs", () => {
  it("reads an ISO-8601 string to epoch milliseconds", () => {
    expect(toEpochMs("2026-01-01T00:00:00.000Z")).toBe(1767225600000);
  });

  it("reads a non-string as epoch milliseconds instead of rejecting it", () => {
    // A hand-edited or externally-written localStorage blob can hold a number.
    // `Date.parse(1767225600000)` is NaN because the digits are not a date.
    expect(toEpochMs(1767225600000)).toBe(1767225600000);
  });

  it("returns NaN for a value it cannot read", () => {
    expect(toEpochMs("13/45/2026")).toBeNaN();
  });
});

describe("sortByDateAsc", () => {
  it("orders trades chronologically", () => {
    const rows = [
      row("third", "2026-03-01T00:00:00.000Z"),
      row("first", "2026-01-01T00:00:00.000Z"),
      row("second", "2026-02-01T00:00:00.000Z"),
    ];

    expect(sortByDateAsc(rows).map((r) => r.id)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("orders by instant, not by string, across timezone offsets", () => {
    const rows = [
      row("later-instant", "2026-01-01T23:00:00Z"),
      row("earlier-instant", "2026-01-01T00:00:00+02:00"),
    ];

    // Lexicographically the +02:00 row sorts last; it is 21h earlier.
    expect(sortByDateAsc(rows).map((r) => r.id)).toEqual([
      "earlier-instant",
      "later-instant",
    ]);
  });

  it("does not mutate the array it is given", () => {
    const rows = [
      row("second", "2026-02-01T00:00:00.000Z"),
      row("first", "2026-01-01T00:00:00.000Z"),
    ];
    const snapshot = [...rows];

    sortByDateAsc(rows);

    expect(rows).toEqual(snapshot);
  });

  it("keeps trades with the same timestamp in input order", () => {
    const rows = [
      row("a", "2026-01-01T00:00:00.000Z"),
      row("b", "2026-01-01T00:00:00.000Z"),
      row("c", "2026-01-01T00:00:00.000Z"),
    ];

    expect(sortByDateAsc(rows).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("sorts a numeric date chronologically rather than dropping it", () => {
    // `date` is typed `string`, so this only arises from a blob written
    // outside the app — exactly the case a bare `Date.parse` breaks on.
    const rows = [
      { id: "second", date: 1767225600000 as unknown as string },
      { id: "first", date: 1735689600000 as unknown as string },
    ];

    expect(sortByDateAsc(rows).map((r) => r.id)).toEqual(["first", "second"]);
  });

  it("sorts an unreadable date last instead of letting it freeze the rest", () => {
    const rows = [
      row("bad", "13/45/2026"),
      row("jan02", "2026-01-02T00:00:00.000Z"),
      row("jan01", "2026-01-01T00:00:00.000Z"),
    ];

    // A comparator subtracting NaN is false in all three directions, so the
    // bad row answers "equal to everything": it would never move and the rows
    // around it would keep input order while the result still looked sorted.
    expect(sortByDateAsc(rows).map((r) => r.id)).toEqual([
      "jan01",
      "jan02",
      "bad",
    ]);
  });

  it("orders the readable rows even when several dates are unreadable", () => {
    const rows = [
      row("bad1", "13/45/2026"),
      row("jan03", "2026-01-03T00:00:00.000Z"),
      row("bad2", "nonsense"),
      row("jan01", "2026-01-01T00:00:00.000Z"),
      row("jan02", "2026-01-02T00:00:00.000Z"),
    ];

    expect(sortByDateAsc(rows).map((r) => r.id)).toEqual([
      "jan01",
      "jan02",
      "jan03",
      "bad1",
      "bad2",
    ]);
  });
});