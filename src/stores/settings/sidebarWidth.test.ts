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
 * FEAT-0617 — a profile written before the sidebar was resizable has no
 * `sidebarWidth` key, and a hand-edited blob can hold anything. Both have to
 * load as a width the control could have produced.
 */

import { describe, expect, it } from "vitest";
import { resolveSidebarWidth } from "./migrations";
import { loadCustomValue } from "./persistenceSchema";
import {
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
} from "../../lib/layout/sidebar";
import { defaultSettings, type Settings } from "./settingsTypes";
import { settingsState } from "../settings.svelte";

function writeTarget() {
  const written: Record<string, unknown> = {};
  return {
    written,
    target: {
      set: (key: string, value: unknown) => {
        written[key] = value;
      },
      entitlement: {},
    },
  };
}

describe("sidebarWidth migration (FEAT-0617)", () => {
  it.each([undefined, null, "", "420", Number.NaN, {}, []])(
    "falls back to the shipped default for %s",
    (stored) => {
      expect(resolveSidebarWidth(stored)).toBe(SIDEBAR_WIDTH_DEFAULT);
    },
  );

  it("clamps a hand-edited value into the supported range", () => {
    expect(resolveSidebarWidth(10)).toBe(SIDEBAR_WIDTH_MIN);
    expect(resolveSidebarWidth(10_000)).toBe(SIDEBAR_WIDTH_MAX);
  });

  it("loads a stored profile without the key as the default", () => {
    const { written, target } = writeTarget();
    const merged = {
      ...defaultSettings,
      sidebarWidth: undefined,
    } as unknown as Settings;

    loadCustomValue(
      "sidebarWidth",
      target as unknown as Parameters<typeof loadCustomValue>[1],
      merged,
      defaultSettings,
    );

    expect(written.sidebarWidth).toBe(SIDEBAR_WIDTH_DEFAULT);
  });

  it("loads a hand-edited width through the same clamp as the handle", () => {
    const { written, target } = writeTarget();
    const merged = { ...defaultSettings, sidebarWidth: 9_999 };

    loadCustomValue(
      "sidebarWidth",
      target as unknown as Parameters<typeof loadCustomValue>[1],
      merged,
      defaultSettings,
    );

    expect(written.sidebarWidth).toBe(SIDEBAR_WIDTH_MAX);
  });

  it("ships the old w-96 width as the default", () => {
    expect(defaultSettings.sidebarWidth).toBe(SIDEBAR_WIDTH_DEFAULT);
  });
});

describe("sidebarWidth serialization (FEAT-0617)", () => {
  it("writes the chosen width through the manager", () => {
    settingsState.sidebarWidth = 420;
    expect(settingsState.sidebarWidth).toBe(420);
    expect(settingsState.toJSON().sidebarWidth).toBe(420);

    settingsState.sidebarWidth = SIDEBAR_WIDTH_DEFAULT;
  });
});
