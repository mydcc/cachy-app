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

/**
 * FEAT-0614 — a profile written before the density setting existed has no
 * `density` key. It must load as `default`, and an unknown stored value must
 * not reach the DOM as an attribute nothing styles.
 */

import { describe, expect, it } from "vitest";
import { resolveDensity } from "./migrations";
import { loadCustomValue } from "./persistenceSchema";
import { defaultSettings, type Settings } from "./settingsTypes";
import { settingsState } from "../settings.svelte";

describe("density migration (FEAT-0614)", () => {
  it.each([undefined, null, "", "dense", 42, {}, "COMPACT"])(
    "falls back to default for %s",
    (stored) => {
      expect(resolveDensity(stored)).toBe("default");
    },
  );

  it.each(["compact", "default", "wide"] as const)("keeps %s", (mode) => {
    expect(resolveDensity(mode)).toBe(mode);
  });

  it("loads a stored profile without a density key as default", () => {
    const written: Record<string, unknown> = {};
    const target = {
      set: (key: string, value: unknown) => {
        written[key] = value;
      },
      entitlement: {},
    };
    // A shape `load()`'s spread cannot produce (it would already carry the
    // default), pinned so the sanitizer is safe if a stored profile is ever
    // assembled another way.
    const merged = { ...defaultSettings, density: undefined } as unknown as Settings;

    loadCustomValue(
      "density",
      target as unknown as Parameters<typeof loadCustomValue>[1],
      merged,
      defaultSettings,
    );

    expect(written.density).toBe("default");
  });

  it("ships default as the value a new profile starts on", () => {
    expect(defaultSettings.density).toBe("default");
  });
});

describe("density serialization (FEAT-0614)", () => {
  it("writes the chosen mode through the manager", () => {
    settingsState.density = "compact";
    expect(settingsState.density).toBe("compact");
    expect(settingsState.toJSON().density).toBe("compact");

    settingsState.density = "wide";
    expect(settingsState.toJSON().density).toBe("wide");

    settingsState.density = "default";
  });
});
