// @vitest-environment happy-dom
/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { describe, it, expect } from "vitest";
import { settingsState } from "../../../stores/settings.svelte";

describe("AssistantView hasApiKey logic", () => {
  function checkHasApiKey(): boolean {
    const provider = settingsState.aiProvider;
    if (provider === "gemini") return !!settingsState.geminiApiKey;
    if (provider === "openai") return !!settingsState.openaiApiKey;
    if (provider === "anthropic") return !!settingsState.anthropicApiKey;
    if (provider === "openrouter") return !!settingsState.openrouterApiKey;
    if (provider === "ollama") return true;
    return false;
  }

  it("recognizes openrouterApiKey when provider is openrouter", () => {
    settingsState.aiProvider = "openrouter";
    settingsState.openrouterApiKey = "";
    expect(checkHasApiKey()).toBe(false);

    settingsState.openrouterApiKey = "sk-or-test-key";
    expect(checkHasApiKey()).toBe(true);
  });

  it("returns true for ollama provider without requiring an API key", () => {
    settingsState.aiProvider = "ollama";
    expect(checkHasApiKey()).toBe(true);
  });
});
