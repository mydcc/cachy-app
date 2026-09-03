// @vitest-environment happy-dom
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

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import CalendarHeatmap from "./CalendarHeatmap.svelte";

describe("CalendarHeatmap.svelte component (FEAT-0365)", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it("renders 12 month cards for the configured year", () => {
    const component = mount(CalendarHeatmap, {
      target: container,
      props: {
        year: 2024,
        data: [],
      },
    });

    flushSync();
    const monthCards = container.querySelectorAll(".month-card");
    expect(monthCards).toHaveLength(12);

    unmount(component);
  });

  it("correctly precomputes leap year vs non-leap year days in February", () => {
    // 2024 is a leap year (February has 29 days)
    const compLeap = mount(CalendarHeatmap, {
      target: container,
      props: {
        year: 2024,
        data: [],
      },
    });
    flushSync();

    const monthCardsLeap = container.querySelectorAll(".month-card");
    const febCardLeap = monthCardsLeap[1]; // February = index 1
    const febDaysLeap = febCardLeap.querySelectorAll(".day-cell");
    expect(febDaysLeap).toHaveLength(29);
    unmount(compLeap);

    // 2023 is a non-leap year (February has 28 days)
    const compNonLeap = mount(CalendarHeatmap, {
      target: container,
      props: {
        year: 2023,
        data: [],
      },
    });
    flushSync();

    const monthCardsNonLeap = container.querySelectorAll(".month-card");
    const febCardNonLeap = monthCardsNonLeap[1];
    const febDaysNonLeap = febCardNonLeap.querySelectorAll(".day-cell");
    expect(febDaysNonLeap).toHaveLength(28);
    unmount(compNonLeap);
  });

  it("precomputes correct empty spacer cells for month offset", () => {
    // January 2024: Jan 1, 2024 was Monday (getDay() = 1).
    // Days-grid children: 7 day-head headers + 1 spacer + 31 day-cells.
    const component = mount(CalendarHeatmap, {
      target: container,
      props: {
        year: 2024,
        data: [],
      },
    });
    flushSync();

    const monthCards = container.querySelectorAll(".month-card");
    const janCard = monthCards[0];
    const daysGrid = janCard.querySelector(".days-grid");
    expect(daysGrid).not.toBeNull();

    const dayHeaders = daysGrid!.querySelectorAll(".text-\\[0\\.6rem\\]");
    expect(dayHeaders).toHaveLength(7);

    const dayCells = daysGrid!.querySelectorAll(".day-cell");
    expect(dayCells).toHaveLength(31);

    // Total grid children = 7 headers + 1 spacer + 31 days = 39
    expect(daysGrid!.children).toHaveLength(39);

    unmount(component);
  });
});
