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

import { describe, expect, it } from "vitest";
import { buildDeTechDict } from "./i18n";
import deDict from "./locales/de.json";
import enDict from "./locales/en.json";

const get = (dict: unknown, path: string): unknown =>
  path
    .split(".")
    .reduce<unknown>(
      (node, key) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[key]
          : undefined,
      dict,
    );

describe("buildDeTechDict", () => {
  it("overwrites technical keys with the English values", () => {
    const dict = buildDeTechDict(deDict, enDict);

    expect(get(dict, "dashboard.price")).toBe(get(enDict, "dashboard.price"));
    expect(get(dict, "common.apply")).toBe(get(enDict, "common.apply"));
  });

  it("keeps non-technical keys German", () => {
    const dict = buildDeTechDict(deDict, enDict);

    expect(get(dict, "settings.technicals.title")).toBe(
      get(deDict, "settings.technicals.title"),
    );
  });

  it("does not mutate its inputs", () => {
    const deBefore = structuredClone(deDict);
    const enBefore = structuredClone(enDict);

    const dict = buildDeTechDict(deDict, enDict);
    dict["__probe__"] = true;

    expect(deDict).toEqual(deBefore);
    expect(enDict).toEqual(enBefore);
  });
});
