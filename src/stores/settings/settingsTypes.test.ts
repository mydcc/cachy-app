/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * Extracted settings presets (FEAT-0342): the technicals presets and the
 * favorites cap must survive the move out of settings.svelte.ts unchanged.
 */
import { describe, it, expect } from "vitest";
import {
  TECHNICALS_UPDATE_PRESETS,
  MAX_FAVORITE_SYMBOLS,
} from "./settingsTypes";

describe("settingsTypes presets", () => {
  it("keeps all four technicals presets with sane fields", () => {
    for (const name of ["realtime", "fast", "balanced", "conservative"] as const) {
      const preset = TECHNICALS_UPDATE_PRESETS[name];
      expect(preset.interval).toBeGreaterThan(0);
      expect(preset.cacheSize).toBeGreaterThan(0);
      expect(preset.cacheTTL).toBeGreaterThan(0);
      expect(preset.historyLimit).toBeGreaterThan(0);
      expect(typeof preset.description).toBe("string");
    }
  });

  it("keeps presets ordered fastest-first", () => {
    const intervals = (Object.keys(TECHNICALS_UPDATE_PRESETS) as Array<
      keyof typeof TECHNICALS_UPDATE_PRESETS
    >).map((k) => TECHNICALS_UPDATE_PRESETS[k].interval);
    expect([...intervals].sort((a, b) => a - b)).toEqual(intervals);
  });

  it("keeps the favorites cap", () => {
    expect(MAX_FAVORITE_SYMBOLS).toBe(12);
  });
});
