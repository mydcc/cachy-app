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
 * BUG-0707 — a fresh install shipped `gemini-1.5-flash` and `gpt-4o`, both
 * retired generations, so the first AI request of a new user could fail before
 * they had configured anything. Two independent places held the same IDs.
 *
 * These cases pin the two halves of the fix: the values come from one source
 * (the registry), and no shipped default names a model the provider no longer
 * serves.
 */

import { describe, expect, it } from "vitest";
import { BUILTIN_AI_PROVIDERS, KNOWN_MODELS, builtinPreset } from "./aiProviders";
import { defaultSettings } from "./settingsTypes";

/** The legacy per-provider settings field each built-in preset feeds. */
const LEGACY_MODEL_FIELDS: Record<string, keyof typeof defaultSettings> = {
  openai: "openaiModel",
  gemini: "geminiModel",
  anthropic: "anthropicModel",
};

describe("shipped AI model defaults (BUG-0707)", () => {
  it("keeps defaultSettings and the provider registry on the same value", () => {
    for (const [provider, field] of Object.entries(LEGACY_MODEL_FIELDS)) {
      const preset = builtinPreset(provider);
      expect(preset, `${provider} preset missing`).toBeDefined();
      expect(defaultSettings[field]).toBe(preset?.defaultModel);
    }
  });

  it("ships a non-empty default that the provider is known to serve", () => {
    for (const preset of BUILTIN_AI_PROVIDERS) {
      const known = KNOWN_MODELS[preset.id];
      // Providers without a curated list are either keyless locals (Ollama)
      // or user-defined endpoints; neither ships a model Cachy chose.
      if (!known) continue;

      expect(preset.defaultModel, `${preset.id} default is empty`).not.toBe("");
      expect(known, `${preset.id} default is not a known model`).toContain(
        preset.defaultModel,
      );
    }
  });

  it("no longer names a retired generation anywhere in the shipped set", () => {
    const retired = [
      "gpt-4o",
      "gpt-4o-mini",
      "gemini-1.5-flash",
      "gemini-1.5-pro",
      "gemini-2.0-flash",
    ];

    for (const preset of BUILTIN_AI_PROVIDERS) {
      expect(retired).not.toContain(preset.defaultModel);
    }
    for (const models of Object.values(KNOWN_MODELS)) {
      for (const retiredId of retired) {
        expect(models).not.toContain(retiredId);
      }
    }
  });
});
