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
 * (the registry), and no live code path names a retired model.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BUILTIN_AI_PROVIDERS,
  KNOWN_MODELS,
  builtinPreset,
} from "./aiProviders";
import { defaultSettings } from "./settingsTypes";
import { resolveAnthropicModel, resolveGeminiModel } from "./migrations";

/** The legacy per-provider settings field each built-in preset feeds. */
const LEGACY_MODEL_FIELDS: Record<string, keyof typeof defaultSettings> = {
  openai: "openaiModel",
  gemini: "geminiModel",
  anthropic: "anthropicModel",
};

/** Built-ins that intentionally ship no model: a keyless local endpoint and a
 *  relay where the user picks from the fetched catalogue. Everything else must
 *  have a non-empty default backed by a KNOWN_MODELS entry. */
const NO_SHIPPED_DEFAULT = new Set(["ollama", "openrouter"]);

const RETIRED = [
  "gpt-4o",
  "gpt-4o-mini",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
  "gemini-2.0-flash",
];

/** Files that choose a fallback model at runtime. Comments may name retired
 *  IDs on purpose (they record history), so only code lines are scanned. */
const LIVE_MODEL_CHOOSERS = [
  "src/services/newsService.ts",
  "src/routes/api/sentiment/+server.ts",
  "src/routes/api/ai/gemini/+server.ts",
  "src/routes/api/ai/anthropic/+server.ts",
  "src/routes/api/ai/openai/+server.ts",
  "src/routes/api/ai/openai-responses/+server.ts",
  "src/stores/settings/migrations.ts",
];

// From src/stores/settings/, the repo root is three levels up.
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));

function codeLines(relativePath: string): string {
  return readFileSync(`${ROOT}/${relativePath}`, "utf8")
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");
}

describe("shipped AI model defaults (BUG-0707)", () => {
  it("keeps defaultSettings and the provider registry on the same value", () => {
    for (const [provider, field] of Object.entries(LEGACY_MODEL_FIELDS)) {
      const preset = builtinPreset(provider);
      expect(preset, `${provider} preset missing`).toBeDefined();
      expect(defaultSettings[field]).toBe(preset?.defaultModel);
    }
  });

  it("ships a non-empty default that is in the provider's known list", () => {
    for (const preset of BUILTIN_AI_PROVIDERS) {
      if (NO_SHIPPED_DEFAULT.has(preset.id)) continue;

      const known = KNOWN_MODELS[preset.id];
      expect(
        known,
        `${preset.id} ships a default but has no KNOWN_MODELS entry`,
      ).toBeDefined();
      expect(preset.defaultModel, `${preset.id} default is empty`).not.toBe("");
      expect(known).toContain(preset.defaultModel);
    }
  });

  it("no longer names a retired generation in the registry", () => {
    for (const preset of BUILTIN_AI_PROVIDERS) {
      expect(RETIRED).not.toContain(preset.defaultModel);
    }
    for (const models of Object.values(KNOWN_MODELS)) {
      for (const retiredId of RETIRED) {
        expect(models).not.toContain(retiredId);
      }
    }
  });

  it("names no retired generation in any live fallback path", () => {
    for (const file of LIVE_MODEL_CHOOSERS) {
      const code = codeLines(file);
      for (const retiredId of RETIRED) {
        expect(code, `${file} still names ${retiredId}`).not.toContain(retiredId);
      }
    }
  });

  it("moves empty and placeholder profiles onto a served model", () => {
    expect(KNOWN_MODELS.gemini).toContain(resolveGeminiModel(""));
    expect(KNOWN_MODELS.gemini).toContain(resolveGeminiModel("gemma"));
    expect(KNOWN_MODELS.anthropic).toContain(
      resolveAnthropicModel("claude-3-5-sonnet-20240620"),
    );
  });
});
