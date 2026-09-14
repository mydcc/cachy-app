/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { describe, it, expect } from "vitest";
import {
  BUILTIN_AI_PROVIDERS,
  BUILTIN_ENTRY_IDS,
  VENDOR_PRESETS,
  activeUserProvider,
  buildUserProvider,
  builtinPreset,
  ensureProviderRegistryState,
  flavorOf,
  isBuiltinEntryId,
  isBuiltinProvider,
  isFreeModelId,
  isLoopbackBaseUrl,
  isValidHttpUrl,
  modelProviderForFlavor,
  newProviderId,
  providerConfigFromLegacy,
  providerConfigReady,
  providerFromPreset,
  redactUserProviders,
  resolveActiveProvider,
  sanitizeUserProviders,
  seedBuiltinEntries,
  validateProviderConfig,
  type ProviderConfig,
} from "./aiProviders";

const validConfig: ProviderConfig = {
  id: "custom",
  label: "My gateway",
  flavor: "openai-chat",
  baseUrl: "https://gateway.example.com/v1",
  model: "llama-3.3-70b",
  apiKey: "sk-test",
  allowServerRelay: false,
};

describe("built-in AI provider registry", () => {
  it("lists every legacy provider exactly once, in presentation order", () => {
    const ids = BUILTIN_AI_PROVIDERS.map((p) => p.id);
    expect(ids).toEqual(["ollama", "openrouter", "openai", "gemini", "anthropic"]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("assigns the documented wire format to each built-in", () => {
    expect(flavorOf("openai")).toBe("openai-chat");
    expect(flavorOf("openrouter")).toBe("openai-chat");
    expect(flavorOf("ollama")).toBe("openai-chat");
    expect(flavorOf("anthropic")).toBe("anthropic-messages");
    expect(flavorOf("gemini")).toBe("google-generate");
    expect(flavorOf("not-a-builtin")).toBeUndefined();
  });

  it("keeps Ollama as the only keyless, local-first preset", () => {
    const keyless = BUILTIN_AI_PROVIDERS.filter((p) => !p.requiresKey);
    expect(keyless).toHaveLength(1);
    expect(keyless[0].id).toBe("ollama");
    expect(builtinPreset("ollama")?.localFirst).toBe(true);
    expect(builtinPreset("openai")?.requiresKey).toBe(true);
  });
});

describe("validateProviderConfig", () => {
  it("accepts a complete config", () => {
    expect(validateProviderConfig(validConfig)).toEqual([]);
  });

  it("reports each missing required field", () => {
    const errors = validateProviderConfig({ ...validConfig, id: " ", label: " ", model: "" });
    expect(errors).toContain("id");
    expect(errors).toContain("label");
    expect(errors).toContain("model");
  });

  it("reports an unknown flavor", () => {
    const errors = validateProviderConfig({
      ...validConfig,
      flavor: "carrier-pigeon" as ProviderConfig["flavor"],
    });
    expect(errors).toContain("flavor");
  });

  it("reports a malformed base URL but accepts an empty one (preset default)", () => {
    expect(validateProviderConfig({ ...validConfig, baseUrl: "localhost:11434" })).toContain(
      "baseUrl",
    );
    expect(validateProviderConfig({ ...validConfig, baseUrl: "" })).toEqual([]);
  });

  it("reports a duplicate id only when the list already carries it", () => {
    expect(
      validateProviderConfig(validConfig, { existingIds: ["custom"] }),
    ).toContain("duplicateId");
    expect(
      validateProviderConfig(validConfig, { existingIds: ["other"] }),
    ).not.toContain("duplicateId");
  });

  it("tolerates an empty model when explicitly allowed (structural migration)", () => {
    expect(validateProviderConfig({ ...validConfig, model: "" })).toContain("model");
    expect(
      validateProviderConfig({ ...validConfig, model: "" }, { allowEmptyModel: true }),
    ).not.toContain("model");
  });
});

describe("providerConfigFromLegacy", () => {
  it("prefers the stored legacy values", () => {
    const cfg = providerConfigFromLegacy("openai", {
      apiKey: "sk-abc",
      model: "gpt-5",
      baseUrl: "https://proxy.example.com/v1/",
    });
    expect(cfg.label).toBe("OpenAI");
    expect(cfg.flavor).toBe("openai-chat");
    expect(cfg.baseUrl).toBe("https://proxy.example.com/v1/"); // trimmed only of whitespace, not the path slash
    expect(cfg.model).toBe("gpt-5");
    expect(cfg.apiKey).toBe("sk-abc");
  });

  it("falls back to the preset default model and endpoint when nothing is stored", () => {
    const cfg = providerConfigFromLegacy("anthropic", { apiKey: "", model: "", baseUrl: "" });
    expect(cfg.baseUrl).toBe("https://api.anthropic.com/v1");
    expect(cfg.model).toBe("claude-sonnet-5");
    expect(cfg.flavor).toBe("anthropic-messages");
  });

  it("keeps Ollama's base URL empty (no hardcoded loopback default)", () => {
    const cfg = providerConfigFromLegacy("ollama", { apiKey: "", model: "", baseUrl: "" });
    expect(cfg.baseUrl).toBe("");
    expect(cfg.flavor).toBe("openai-chat");
  });

  it("defaults the server relay to off for every provider", () => {
    for (const preset of BUILTIN_AI_PROVIDERS) {
      const cfg = providerConfigFromLegacy(preset.id, { apiKey: "k", model: "m", baseUrl: "" });
      expect(cfg.allowServerRelay).toBe(false);
    }
  });
});

describe("isFreeModelId", () => {
  it("recognises the free-tier markers aggregators publish", () => {
    expect(isFreeModelId("deepseek-v4-flash-free")).toBe(true);
    expect(isFreeModelId("longcat-2.0:free")).toBe(true);
    expect(isFreeModelId("google/gemma-2-9b-it:free")).toBe(true);
  });

  it("does not flag a name that merely contains 'free'", () => {
    expect(isFreeModelId("gpt-4o")).toBe(false);
    expect(isFreeModelId("free-llama")).toBe(false);
    expect(isFreeModelId("deepseek-free-preview")).toBe(false);
    expect(isFreeModelId("claude-sonnet-5")).toBe(false);
  });
});

describe("isValidHttpUrl", () => {
  it("accepts absolute http(s) URLs and rejects everything else", () => {
    expect(isValidHttpUrl("https://opencode.ai/zen/v1")).toBe(true);
    expect(isValidHttpUrl("http://127.0.0.1:8000/v1")).toBe(true); // shape only; server blocks reserved hosts
    expect(isValidHttpUrl("ftp://example.com")).toBe(false);
    expect(isValidHttpUrl("localhost:11434")).toBe(false);
    expect(isValidHttpUrl("not a url")).toBe(false);
  });
});

describe("registry input hardening (non-string fields)", () => {
  it("reports missing or non-string fields instead of throwing", () => {
    const broken = {
      id: undefined,
      label: 42,
      flavor: undefined,
      baseUrl: 123,
      model: null,
      apiKey: undefined,
      allowServerRelay: false,
    } as unknown as ProviderConfig;

    expect(() => validateProviderConfig(broken)).not.toThrow();
    const errors = validateProviderConfig(broken);
    expect(errors).toContain("id");
    expect(errors).toContain("label");
    expect(errors).toContain("flavor");
    expect(errors).toContain("model");
  });

  it("treats non-string URLs and model ids as invalid without throwing", () => {
    expect(isValidHttpUrl(undefined)).toBe(false);
    expect(isValidHttpUrl(123)).toBe(false);
    expect(isFreeModelId(undefined)).toBe(false);
    expect(isFreeModelId(42)).toBe(false);
  });

  it("builds a legacy config from non-string stored values without throwing", () => {
    const cfg = providerConfigFromLegacy("openai", {
      apiKey: undefined,
      model: 123,
      baseUrl: null,
    } as unknown as Parameters<typeof providerConfigFromLegacy>[1]);

    expect(cfg.baseUrl).toBe("https://api.openai.com/v1");
    expect(cfg.model).toBe("gpt-4o");
    expect(cfg.apiKey).toBe("");
  });
});

describe("user provider management", () => {
  it("distinguishes built-in ids from user ids", () => {
    expect(isBuiltinProvider("openai")).toBe(true);
    expect(isBuiltinProvider("custom-gateway")).toBe(false);
  });

  it("generates a new provider id that is not a built-in or an existing id", () => {
    const id = newProviderId([{ ...validConfig, id: "existing" }]);
    expect(id.length).toBeGreaterThan(0);
    expect(isBuiltinProvider(id)).toBe(false);
    expect(id).not.toBe("existing");
  });

  it("builds a blank user provider with the default flavor and relay off", () => {
    const provider = buildUserProvider([]);
    expect(provider.label).toBe("");
    expect(provider.baseUrl).toBe("");
    expect(provider.model).toBe("");
    expect(provider.apiKey).toBe("");
    expect(provider.flavor).toBe("openai-chat");
    expect(provider.allowServerRelay).toBe(false);
    expect(isBuiltinProvider(provider.id)).toBe(false);
  });

  it("redacts credentials without mutating the source or losing other fields", () => {
    const source = [{ ...validConfig, apiKey: "sk-secret" }];
    const redacted = redactUserProviders(source);

    expect(redacted[0].apiKey).toBe("");
    expect(redacted[0].label).toBe(validConfig.label);
    expect(redacted[0].baseUrl).toBe(validConfig.baseUrl);
    expect(source[0].apiKey).toBe("sk-secret"); // untouched
  });

  it("resolves the active user provider, and nothing for built-in or dangling ids", () => {
    const providers = [validConfig];
    expect(activeUserProvider(providers, "custom")).toBe(providers[0]);
    expect(activeUserProvider(providers, "openai")).toBeUndefined();
    expect(activeUserProvider(providers, "missing")).toBeUndefined();
    expect(activeUserProvider(providers, "")).toBeUndefined();
    expect(activeUserProvider(undefined, "custom")).toBeUndefined();
  });

  it("sanitizes stored providers, dropping junk, duplicates and built-in ids", () => {
    const out = sanitizeUserProviders([
      {
        id: "a",
        label: "A",
        flavor: "openai-chat",
        baseUrl: "https://gateway.example.com/v1",
        model: "m",
        apiKey: "k",
        allowServerRelay: true,
      },
      { id: "a", label: "duplicate id" },
      { id: "openai", label: "would shadow the built-in" },
      { label: "no id" },
      null,
      42,
      { id: "b", label: "", flavor: "carrier-pigeon" },
    ]);

    expect(out.map((p) => p.id)).toEqual(["a", "b"]);
    expect(out[0].allowServerRelay).toBe(true);
    expect(out[1].label).toBe("b"); // label falls back to the id
    expect(out[1].flavor).toBe("openai-chat"); // unknown flavor -> default
    expect(out[1].allowServerRelay).toBe(false);
  });

  it("returns an empty list for non-array stored input", () => {
    expect(sanitizeUserProviders(undefined)).toEqual([]);
    expect(sanitizeUserProviders({ id: "a" })).toEqual([]);
    expect(sanitizeUserProviders("nope")).toEqual([]);
  });
});

describe("single-registry unification", () => {
  const legacy = {
    openai: { apiKey: "sk-o", model: "gpt-4o", baseUrl: "" },
    anthropic: { apiKey: "", model: "claude", baseUrl: "" },
    gemini: { apiKey: "AIza", model: "gem", baseUrl: "" },
    ollama: { apiKey: "", model: "llama", baseUrl: "http://localhost:11434" },
    openrouter: { apiKey: "", model: "", baseUrl: "" },
  };
  const seedLegacy = {
    openai: legacy.openai,
    anthropic: legacy.anthropic,
    gemini: legacy.gemini,
    ollama: legacy.ollama,
  };

  it("seeds the four built-ins once and never touches existing entries", () => {
    const once = seedBuiltinEntries([], seedLegacy);
    expect(once.map((p) => p.id)).toEqual([
      BUILTIN_ENTRY_IDS.openai,
      BUILTIN_ENTRY_IDS.anthropic,
      BUILTIN_ENTRY_IDS.gemini,
      BUILTIN_ENTRY_IDS.ollama,
    ]);
    expect(
      once.find((p) => p.id === BUILTIN_ENTRY_IDS.openai),
    ).toMatchObject({ apiKey: "sk-o", model: "gpt-4o", allowServerRelay: true });
    expect(
      once.find((p) => p.id === BUILTIN_ENTRY_IDS.ollama),
    ).toMatchObject({ allowServerRelay: false });

    const edited = once.map((p) =>
      p.id === BUILTIN_ENTRY_IDS.openai ? { ...p, model: "gpt-5" } : p,
    );
    const twice = seedBuiltinEntries(edited, seedLegacy);
    expect(
      twice.find((p) => p.id === BUILTIN_ENTRY_IDS.openai)?.model,
    ).toBe("gpt-5");
    expect(twice).toHaveLength(4);
  });

  it("marks readiness like the send path requires", () => {
    expect(providerConfigReady({ ...validConfig })).toBe(true);
    expect(providerConfigReady({ ...validConfig, apiKey: "  " })).toBe(false);
    expect(providerConfigReady({ ...validConfig, baseUrl: "" })).toBe(false);
    expect(providerConfigReady(undefined)).toBe(false);
    expect(
      providerConfigReady({
        ...validConfig,
        id: BUILTIN_ENTRY_IDS.ollama,
        apiKey: "",
      }),
    ).toBe(true);
    expect(
      providerConfigReady({
        ...validConfig,
        id: BUILTIN_ENTRY_IDS.openai,
        baseUrl: "",
      }),
    ).toBe(true);
    expect(
      providerConfigReady({
        ...validConfig,
        id: BUILTIN_ENTRY_IDS.openai,
        apiKey: "",
        baseUrl: "https://gw.example.com/v1",
      }),
    ).toBe(true);
    expect(
      providerConfigReady({
        ...validConfig,
        id: BUILTIN_ENTRY_IDS.openai,
        apiKey: "",
        baseUrl: "",
      }),
    ).toBe(false);
  });

  it("resolves the stored entry first and falls back to legacy", () => {
    const custom = { ...validConfig, id: "c1", label: "Zen" };
    const stored = resolveActiveProvider({
      userProviders: [custom],
      activeProviderId: "c1",
      aiProvider: "gemini",
      legacy,
    });
    expect(stored.entry?.id).toBe("c1");
    expect(stored.ready).toBe(true);
    expect(stored.label).toBe("Zen");

    const fallback = resolveActiveProvider({
      userProviders: [],
      activeProviderId: "",
      aiProvider: "gemini",
      legacy,
    });
    expect(fallback.entry?.id).toBe(BUILTIN_ENTRY_IDS.gemini);
    expect(fallback.ready).toBe(true);
    expect(fallback.label).toBe("Gemini");

    const missing = resolveActiveProvider({
      userProviders: [],
      activeProviderId: "",
      aiProvider: "anthropic",
      legacy: {
        ...legacy,
        anthropic: { apiKey: "", model: "", baseUrl: "" },
      },
    });
    expect(missing.ready).toBe(false);
  });

  it("defaults and migrates the registry state", () => {
    const fresh = ensureProviderRegistryState({
      userProviders: [],
      activeProviderId: "",
      aiProvider: "gemini",
      legacy,
    });
    expect(fresh.userProviders).toHaveLength(4);
    expect(fresh.activeProviderId).toBe(BUILTIN_ENTRY_IDS.gemini);

    const migrated = ensureProviderRegistryState({
      userProviders: [],
      activeProviderId: "",
      aiProvider: "openrouter",
      legacy: {
        ...legacy,
        openrouter: { apiKey: "sk-or", model: "m", baseUrl: "" },
      },
    });
    expect(migrated.aiProvider).toBe("openai");
    const entry = migrated.userProviders.find(
      (p) => p.id === migrated.activeProviderId,
    );
    expect(entry?.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(entry?.apiKey).toBe("sk-or");

    const kept = ensureProviderRegistryState({
      userProviders: [{ ...validConfig, id: "c1" }],
      activeProviderId: "c1",
      aiProvider: "gemini",
      legacy,
    });
    expect(kept.activeProviderId).toBe("c1");
  });

  it("offers the vendor presets with fixed base URLs", () => {
    expect(VENDOR_PRESETS.map((p) => p.id)).toEqual([
      "xai",
      "deepseek",
      "mistral",
      "groq",
      "openrouter",
      "opencode-zen",
      "opencode-go",
      "command-code",
      "omniroute",
    ]);
    expect(
      VENDOR_PRESETS.find((p) => p.id === "omniroute")?.baseUrl,
    ).toBe("http://localhost:20128/v1");
    const fromPreset = providerFromPreset(VENDOR_PRESETS[0]);
    expect(fromPreset.baseUrl).toBe("https://api.x.ai/v1");
    expect(fromPreset.apiKey).toBe("");
  });

  it("detects loopback roots and builtin ids", () => {
    expect(isLoopbackBaseUrl("http://localhost:20128/v1")).toBe(true);
    expect(isLoopbackBaseUrl("https://opencode.ai/zen/v1")).toBe(false);
    expect(isBuiltinEntryId(BUILTIN_ENTRY_IDS.openai)).toBe(true);
    expect(isBuiltinEntryId("whatever")).toBe(false);
  });

  it("maps flavors to model-list routes", () => {
    expect(modelProviderForFlavor("openai-chat")).toBe("openai");
    expect(modelProviderForFlavor("openai-responses")).toBe("openai");
    expect(modelProviderForFlavor("anthropic-messages")).toBe("anthropic");
    expect(modelProviderForFlavor("google-generate")).toBe("gemini");
  });
});
