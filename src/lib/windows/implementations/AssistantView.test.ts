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

/*
 * The assistant gate (`hasApiKey` in AssistantView) resolves through
 * `resolveActiveProvider`, so these pin the blocking behavior against the
 * real decision: a configured custom provider unlocks the assistant, a
 * keyless one (or a built-in without key) keeps the overlay.
 */

import { describe, it, expect } from "vitest";
import {
  BUILTIN_ENTRY_IDS,
  resolveActiveProvider,
} from "../../../stores/settings/aiProviders";

const legacy = {
  openai: { apiKey: "", model: "", baseUrl: "" },
  anthropic: { apiKey: "", model: "", baseUrl: "" },
  gemini: { apiKey: "AIza-test", model: "gemini-2.0-flash", baseUrl: "" },
  openrouter: { apiKey: "", model: "", baseUrl: "" },
  ollama: { apiKey: "", model: "llama3.3", baseUrl: "http://localhost:11434" },
};

describe("AssistantView provider gate", () => {
  it("unlocks for an active custom provider with key and URL", () => {
    const custom = {
      id: "zen",
      label: "OpenCode Zen",
      flavor: "openai-chat" as const,
      baseUrl: "https://opencode.ai/zen/v1",
      model: "kimi-k3",
      apiKey: "sk-test",
      allowServerRelay: false,
    };

    const resolved = resolveActiveProvider({
      userProviders: [custom],
      activeProviderId: "zen",
      aiProvider: "gemini",
      legacy,
    });

    expect(resolved.ready).toBe(true);
    expect(resolved.label).toBe("OpenCode Zen");
  });

  it("stays blocked for a custom provider without a key", () => {
    const custom = {
      id: "zen",
      label: "OpenCode Zen",
      flavor: "openai-chat" as const,
      baseUrl: "https://opencode.ai/zen/v1",
      model: "kimi-k3",
      apiKey: "",
      allowServerRelay: false,
    };

    const resolved = resolveActiveProvider({
      userProviders: [custom],
      activeProviderId: "zen",
      aiProvider: "gemini",
      legacy,
    });

    expect(resolved.ready).toBe(false);
  });

  it("unlocks for the gemini built-in with a key and shows its label", () => {
    const resolved = resolveActiveProvider({
      userProviders: [],
      activeProviderId: BUILTIN_ENTRY_IDS.gemini,
      aiProvider: "gemini",
      legacy,
    });

    // No stored entry: falls back to the legacy fields, which carry the key.
    expect(resolved.ready).toBe(true);
    expect(resolved.label).toBe("Gemini");
  });

  it("unlocks for ollama without a key", () => {
    const resolved = resolveActiveProvider({
      userProviders: [],
      activeProviderId: BUILTIN_ENTRY_IDS.ollama,
      aiProvider: "ollama",
      legacy,
    });

    expect(resolved.ready).toBe(true);
  });
});
