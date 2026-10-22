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

/*
 * FEAT-0614 — the two logic pieces of the density feature. Both were previously
 * untested glue: the grid mapping and the store → root-attribute write.
 */

import { describe, expect, it } from "vitest";
import { applyDensityAttribute, densityGap } from "./density";

describe("densityGap (FEAT-0614)", () => {
  it("scales a numeric step through the density factor", () => {
    expect(densityGap("gap-4")).toBe(
      "gap-[calc(var(--density-gap-scale)*1rem)]",
    );
  });

  it("handles the two-axis form", () => {
    expect(densityGap("gap-x-6 gap-y-3")).toBe(
      "gap-x-[calc(var(--density-gap-scale)*1.5rem)] gap-y-[calc(var(--density-gap-scale)*0.75rem)]",
    );
  });

  it("leaves non-numeric tokens untouched", () => {
    expect(densityGap("gap-[var(--density-section-gap)]")).toBe(
      "gap-[var(--density-section-gap)]",
    );
    expect(densityGap("flex gap-2 items-center")).toBe(
      "flex gap-[calc(var(--density-gap-scale)*0.5rem)] items-center",
    );
  });

  it("keeps the token order and does not invent tokens", () => {
    expect(densityGap("")).toBe("");
    expect(densityGap("gap-0")).toBe(
      "gap-[calc(var(--density-gap-scale)*0rem)]",
    );
  });
});

describe("applyDensityAttribute (FEAT-0614)", () => {
  it("writes the mode onto the root, including default", () => {
    const root = { dataset: {} as DOMStringMap };

    applyDensityAttribute(root, "default");
    expect(root.dataset.density).toBe("default");

    applyDensityAttribute(root, "compact");
    expect(root.dataset.density).toBe("compact");

    applyDensityAttribute(root, "wide");
    expect(root.dataset.density).toBe("wide");
  });
});
