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
 *
 * AI provider registry — FEAT-0467, ADR-0019.
 *
 * Pure module: no I/O, no store reads, no Svelte runes, so the registry, the
 * validation and the migration off the legacy per-provider settings fields can
 * be tested without a DOM.
 *
 * A provider is a *wire format* plus an endpoint. "Which provider" used to be
 * the fixed `AiProvider` union plus a settings field per provider; here the
 * built-ins are presets of one registry shape so a user can add their own
 * OpenAI-, Anthropic- or Google-compatible entry without a new code path.
 *
 * Credentials are Class A (ADR-0001). `ProviderConfig.apiKey` is the in-memory
 * value only; encryption at rest is layered on in a later slice, mirroring the
 * named exchange accounts.
 */

import type { AiProvider } from "../settings.svelte";
import { generateId } from "../../utils/utils";

/**
 * The wire format a provider speaks. Everything provider-specific — request
 * mapping, streaming parse, model listing — is keyed on this, not on the
 * vendor.
 */
export type AiApiFlavor =
  | "openai-chat"
  | "openai-responses"
  | "anthropic-messages"
  | "google-generate";

export const AI_API_FLAVORS: readonly AiApiFlavor[] = [
  "openai-chat",
  "openai-responses",
  "anthropic-messages",
  "google-generate",
];

/** Flavor used when a config does not name one explicitly. */
export const DEFAULT_AI_API_FLAVOR: AiApiFlavor = "openai-chat";

/** A provider entry, built-in or user-created. */
export interface ProviderConfig {
  /** Stable identity. Never reused, never rewritten by a migration. */
  id: string;
  /** User-facing label. */
  label: string;
  flavor: AiApiFlavor;
  /** Base URL of the provider. Empty means "use the preset default". */
  baseUrl: string;
  model: string;
  /** In-memory credential; encrypted at rest in a later slice (ADR-0019). */
  apiKey: string;
  /**
   * Opt-in server relay for providers that do not answer a browser
   * cross-origin request. Off by default; the key must not transit Cachy
   * infrastructure unless the user turned this on (ADR-0019).
   */
  allowServerRelay: boolean;
}

/** A built-in provider definition. User providers are plain `ProviderConfig`s. */
export interface BuiltinProviderPreset {
  id: AiProvider;
  label: string;
  flavor: AiApiFlavor;
  defaultBaseUrl: string;
  defaultModel: string;
  /** Whether the provider cannot be used without the user's own key. */
  requiresKey: boolean;
  /** Reached directly from the browser and typically local (ADR-0011). */
  localFirst: boolean;
}

/**
 * The built-in providers. Order is presentation order in Settings → AI.
 * Defaults mirror the values the send path and model routes already use.
 */
export const BUILTIN_AI_PROVIDERS: readonly BuiltinProviderPreset[] = [
  {
    id: "ollama",
    label: "Ollama",
    flavor: "openai-chat",
    defaultBaseUrl: "",
    defaultModel: "",
    requiresKey: false,
    localFirst: true,
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    flavor: "openai-chat",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "",
    requiresKey: true,
    localFirst: false,
  },
  {
    id: "openai",
    label: "OpenAI",
    flavor: "openai-chat",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o",
    requiresKey: true,
    localFirst: false,
  },
  {
    id: "gemini",
    label: "Google Gemini",
    flavor: "google-generate",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-1.5-flash",
    requiresKey: true,
    localFirst: false,
  },
  {
    id: "anthropic",
    label: "Anthropic",
    flavor: "anthropic-messages",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-5",
    requiresKey: true,
    localFirst: false,
  },
];

const PRESETS_BY_ID = new Map<string, BuiltinProviderPreset>(
  BUILTIN_AI_PROVIDERS.map((p) => [p.id, p]),
);

/** The built-in preset for an id, or `undefined` for a user-created provider. */
export function builtinPreset(id: string): BuiltinProviderPreset | undefined {
  return PRESETS_BY_ID.get(id);
}

/** The wire format of a provider id, when it is a built-in. */
export function flavorOf(id: string): AiApiFlavor | undefined {
  return PRESETS_BY_ID.get(id)?.flavor;
}

/** Coerce an untrusted value to a string; non-strings become "". */
function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** True for an absolute http(s) URL. Format only — reserved hosts are a
 *  server-side concern enforced by `src/lib/server/urlValidator.ts`.
 *  Accepts `unknown` so registry input that came back from storage cannot
 *  throw here. */
export function isValidHttpUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Error codes for `validateProviderConfig`; the UI translates them. */
export type ProviderConfigError =
  | "id"
  | "label"
  | "flavor"
  | "model"
  | "baseUrl"
  | "duplicateId";

export interface ValidateProviderConfigOptions {
  /** Ids already in use; the config's own id must not appear twice. */
  existingIds?: readonly string[];
  /** Structural migration tolerates an empty model and base URL. */
  allowEmptyModel?: boolean;
}

/**
 * Validate a provider config. Returns the list of problems, empty when valid.
 *
 * `baseUrl` is optional: an empty value means the preset default. It is only
 * checked for shape, never for reachability — the server owns that.
 *
 * Fields are read defensively: a missing or non-string value is reported as
 * the corresponding error instead of throwing, because a config can come back
 * from persisted storage rather than only from the typed UI.
 */
export function validateProviderConfig(
  cfg: ProviderConfig,
  options: ValidateProviderConfigOptions = {},
): ProviderConfigError[] {
  const errors: ProviderConfigError[] = [];
  const id = text(cfg.id).trim();

  if (!id) errors.push("id");
  if (!text(cfg.label).trim()) errors.push("label");
  if (!AI_API_FLAVORS.includes(cfg.flavor)) errors.push("flavor");
  if (!options.allowEmptyModel && !text(cfg.model).trim()) errors.push("model");

  const baseUrl = text(cfg.baseUrl).trim();
  if (baseUrl && !isValidHttpUrl(baseUrl)) errors.push("baseUrl");

  if (id && options.existingIds?.includes(id)) errors.push("duplicateId");

  return errors;
}

/** The legacy per-provider settings fields a built-in config is built from. */
export interface LegacyAiProviderFields {
  apiKey: string;
  model: string;
  baseUrl: string;
}

/**
 * Build a `ProviderConfig` for a built-in from its legacy settings fields,
 * falling back to the preset's default endpoint and model. This is the
 * read-only bridge the settings store migrates through; it does not mutate
 * anything.
 */
export function providerConfigFromLegacy(
  id: AiProvider,
  legacy: LegacyAiProviderFields,
): ProviderConfig {
  const preset = builtinPreset(id);
  return {
    id,
    label: preset?.label ?? id,
    flavor: preset?.flavor ?? DEFAULT_AI_API_FLAVOR,
    baseUrl: text(legacy.baseUrl).trim() || preset?.defaultBaseUrl || "",
    model: text(legacy.model).trim() || preset?.defaultModel || "",
    apiKey: text(legacy.apiKey),
    allowServerRelay: false,
  };
}

/**
 * Free-tier model ids, as published by aggregators: OpenCode Zen and
 * Command Code mark them `-free` / `:free`. Used to label the picker, never to
 * filter a model out.
 */
export function isFreeModelId(id: unknown): boolean {
  return typeof id === "string" && /[-:]free$/i.test(id.trim());
}

/** True when `id` names one of the built-in presets. */
export function isBuiltinProvider(id: string): boolean {
  return PRESETS_BY_ID.has(id);
}

/**
 * An id for a provider the user is creating. User ids cannot collide with the
 * built-in preset ids because those are exactly the five reserved words.
 */
export function newProviderId(existing: readonly ProviderConfig[]): string {
  const taken = new Set<string>([...existing.map((p) => p.id), ...PRESETS_BY_ID.keys()]);
  let id = generateId();
  while (taken.has(id)) id = generateId();
  return id;
}

/** A blank user provider with an id that cannot collide. */
export function buildUserProvider(existing: readonly ProviderConfig[]): ProviderConfig {
  return {
    id: newProviderId(existing),
    label: "",
    flavor: DEFAULT_AI_API_FLAVOR,
    baseUrl: "",
    model: "",
    apiKey: "",
    allowServerRelay: false,
  };
}

/**
 * Providers with credentials blanked, for the serialization that `toJSON()`
 * emits. Only `apiKey` is cleared; everything the UI binds to survives.
 */
export function redactUserProviders(
  providers: readonly ProviderConfig[],
): ProviderConfig[] {
  return providers.map((provider) => ({ ...provider, apiKey: "" }));
}

/**
 * Coerce persisted provider entries into well-formed configs, dropping
 * anything unusable (non-objects, missing ids, duplicate ids). Used at the
 * storage boundary and after decryption, so the rest of the app can trust the
 * shape. A bad entry is dropped rather than repaired into a nameless provider.
 */
export function sanitizeUserProviders(raw: unknown): ProviderConfig[] {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const providers: ProviderConfig[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry as Record<string, unknown>;
    const id = text(candidate.id).trim();
    if (!id || seen.has(id)) continue;
    // A stored id that names a built-in would shadow it for
    // `activeUserProvider`; drop it at the boundary.
    if (isBuiltinProvider(id)) continue;
    seen.add(id);

    const flavor = AI_API_FLAVORS.includes(candidate.flavor as AiApiFlavor)
      ? (candidate.flavor as AiApiFlavor)
      : DEFAULT_AI_API_FLAVOR;

    providers.push({
      id,
      label: text(candidate.label).trim() || id,
      flavor,
      baseUrl: text(candidate.baseUrl).trim(),
      model: text(candidate.model).trim(),
      apiKey: text(candidate.apiKey),
      allowServerRelay: candidate.allowServerRelay === true,
    });
  }

  return providers;
}

/**
 * The active provider when it is a user provider. Returns `undefined` for a
 * built-in id (or a dangling one), so the caller falls back to the built-in
 * settings fields.
 */
export function activeUserProvider(
  providers: readonly ProviderConfig[] | undefined | null,
  activeProviderId: string | undefined | null,
): ProviderConfig | undefined {
  if (!activeProviderId) return undefined;
  return providers?.find((provider) => provider.id === activeProviderId);
}

/**
 * Stable ids for the seeded built-in entries. They live in the same registry
 * array as user entries so tabs, gate and send path resolve one shape. The
 * `builtin-` prefix keeps them clear of user UUIDs and of the reserved ids
 * `sanitizeUserProviders` drops.
 */
export const BUILTIN_ENTRY_IDS = {
  openai: "builtin-openai",
  anthropic: "builtin-anthropic",
  gemini: "builtin-gemini",
  ollama: "builtin-ollama",
} as const;

/** True for a seeded built-in entry id (as opposed to a user entry). */
export function isBuiltinEntryId(id: string | undefined | null): boolean {
  return (
    id === BUILTIN_ENTRY_IDS.openai ||
    id === BUILTIN_ENTRY_IDS.anthropic ||
    id === BUILTIN_ENTRY_IDS.gemini ||
    id === BUILTIN_ENTRY_IDS.ollama
  );
}

const LOOPBACK_RE =
  /^https?:\/\/(localhost|127\.0\.0\.1|\[?::1\]?)(:\d+)?(\/|$)/i;

/** True for a local gateway root (Ollama, OmniRoute, …), which is always reached browser-direct. */
export function isLoopbackBaseUrl(baseUrl: string): boolean {
  return LOOPBACK_RE.test(baseUrl.trim());
}

/**
 * Preset catalog for "add provider". A preset only pre-fills label, flavor
 * and base URL — every field stays editable after adding, including the URL.
 */
export interface VendorPreset {
  id: string;
  label: string;
  flavor: AiApiFlavor;
  baseUrl: string;
}

export const VENDOR_PRESETS: readonly VendorPreset[] = [
  { id: "xai", label: "xAI (Grok)", flavor: "openai-chat", baseUrl: "https://api.x.ai/v1" },
  { id: "deepseek", label: "DeepSeek", flavor: "openai-chat", baseUrl: "https://api.deepseek.com/v1" },
  { id: "mistral", label: "Mistral", flavor: "openai-chat", baseUrl: "https://api.mistral.ai/v1" },
  { id: "groq", label: "Groq", flavor: "openai-chat", baseUrl: "https://api.groq.com/openai/v1" },
  { id: "openrouter", label: "OpenRouter", flavor: "openai-chat", baseUrl: "https://openrouter.ai/api/v1" },
  { id: "opencode-zen", label: "OpenCode Zen", flavor: "openai-chat", baseUrl: "https://opencode.ai/zen/v1" },
  { id: "opencode-go", label: "OpenCode Go", flavor: "openai-chat", baseUrl: "https://opencode.ai/zen/go/v1" },
  { id: "command-code", label: "Command Code", flavor: "openai-chat", baseUrl: "https://api.commandcode.ai/provider/v1" },
  { id: "omniroute", label: "OmniRoute (lokal)", flavor: "openai-chat", baseUrl: "http://localhost:20128/v1" },
];

/** A user entry pre-filled from a preset (key and model left blank). */
export function providerFromPreset(preset: VendorPreset): ProviderConfig {
  return {
    ...buildUserProvider([]),
    label: preset.label,
    flavor: preset.flavor,
    baseUrl: preset.baseUrl,
  };
}

/** True when the entry carries what the send path requires. */
export function providerConfigReady(
  provider: ProviderConfig | undefined | null,
): provider is ProviderConfig {
  if (!provider) return false;
  if (provider.id === BUILTIN_ENTRY_IDS.ollama) return true;
  if (isBuiltinEntryId(provider.id)) {
    // Seeded built-ins inherit the legacy leniency (key or custom URL), the
    // vendor default covering the empty side.
    return provider.apiKey.trim() !== "" || provider.baseUrl.trim() !== "";
  }
  return provider.baseUrl.trim() !== "" && provider.apiKey.trim() !== "";
}

export interface BuiltinLegacyFields {
  apiKey: string;
  model: string;
  baseUrl: string;
}

interface BuiltinDef {
  id: (typeof BUILTIN_ENTRY_IDS)[keyof typeof BUILTIN_ENTRY_IDS];
  label: string;
  flavor: AiApiFlavor;
  relay: boolean;
  legacyKey: "openai" | "anthropic" | "gemini" | "ollama";
}

const BUILTIN_DEFS: readonly BuiltinDef[] = [
  { id: BUILTIN_ENTRY_IDS.openai, label: "OpenAI", flavor: "openai-chat", relay: true, legacyKey: "openai" },
  { id: BUILTIN_ENTRY_IDS.anthropic, label: "Anthropic", flavor: "anthropic-messages", relay: true, legacyKey: "anthropic" },
  { id: BUILTIN_ENTRY_IDS.gemini, label: "Gemini", flavor: "google-generate", relay: true, legacyKey: "gemini" },
  { id: BUILTIN_ENTRY_IDS.ollama, label: "Ollama", flavor: "openai-chat", relay: false, legacyKey: "ollama" },
];

/**
 * Ensures the four built-in entries exist, seeded once from the legacy
 * per-provider fields. Idempotent — existing entries (including user-edited
 * built-ins) are never touched.
 */
export function seedBuiltinEntries(
  existing: readonly ProviderConfig[],
  legacy: Record<"openai" | "anthropic" | "gemini" | "ollama", BuiltinLegacyFields>,
): ProviderConfig[] {
  const have = new Set(existing.map((entry) => entry.id));
  const seeded: ProviderConfig[] = [...existing];
  for (const def of BUILTIN_DEFS) {
    if (have.has(def.id)) continue;
    const fields = legacy[def.legacyKey];
    seeded.push({
      id: def.id,
      label: def.label,
      flavor: def.flavor,
      baseUrl: fields.baseUrl,
      model: fields.model,
      apiKey: fields.apiKey,
      allowServerRelay: def.relay,
    });
  }
  return seeded;
}

export interface ResolvedActiveProvider {
  entry: ProviderConfig | undefined;
  ready: boolean;
  label: string;
}

/**
 * Single resolution for gate, send path and UI: the stored entry wins; a
 * profile that predates the seeded registry (or a dangling id) falls back to
 * a transient built-in built from the legacy fields.
 */
export function resolveActiveProvider(input: {
  userProviders: readonly ProviderConfig[] | undefined | null;
  activeProviderId: string | undefined | null;
  aiProvider: AiProvider;
  legacy: Record<AiProvider, BuiltinLegacyFields>;
}): ResolvedActiveProvider {
  const stored = activeUserProvider(input.userProviders, input.activeProviderId);
  if (stored) {
    return { entry: stored, ready: providerConfigReady(stored), label: stored.label };
  }
  const transient = transientBuiltinEntry(input.aiProvider, input.legacy);
  return {
    entry: transient,
    ready: providerConfigReady(transient),
    label: transient?.label ?? input.aiProvider,
  };
}

function transientBuiltinEntry(
  aiProvider: AiProvider,
  legacy: Record<AiProvider, BuiltinLegacyFields>,
): ProviderConfig | undefined {
  if (aiProvider === "openrouter") {
    return {
      id: "openrouter",
      label: "OpenRouter",
      flavor: "openai-chat",
      baseUrl: legacy.openrouter.baseUrl,
      model: legacy.openrouter.model,
      apiKey: legacy.openrouter.apiKey,
      allowServerRelay: true,
    };
  }
  const def = BUILTIN_DEFS.find((candidate) => candidate.legacyKey === aiProvider);
  if (!def) return undefined;
  const fields = legacy[def.legacyKey];
  return {
    id: def.id,
    label: def.label,
    flavor: def.flavor,
    baseUrl: fields.baseUrl,
    model: fields.model,
    apiKey: fields.apiKey,
    allowServerRelay: def.relay,
  };
}

export interface RegistryEnsureInput {
  userProviders: readonly ProviderConfig[];
  activeProviderId: string;
  aiProvider: AiProvider;
  legacy: Record<AiProvider, BuiltinLegacyFields>;
}

export interface RegistryEnsureOutput {
  userProviders: ProviderConfig[];
  activeProviderId: string;
  aiProvider: AiProvider;
}

/**
 * Pure core of the registry unification: seeds the built-in entries,
 * migrates a legacy OpenRouter selection into a preset entry (its tab is
 * gone), and defaults the active id. Idempotent.
 */
export function ensureProviderRegistryState(
  input: RegistryEnsureInput,
): RegistryEnsureOutput {
  let userProviders = seedBuiltinEntries(input.userProviders, {
    openai: input.legacy.openai,
    anthropic: input.legacy.anthropic,
    gemini: input.legacy.gemini,
    ollama: input.legacy.ollama,
  });
  let activeProviderId = input.activeProviderId;
  let aiProvider = input.aiProvider;

  if (aiProvider === "openrouter") {
    const base = input.legacy.openrouter.baseUrl.replace(/\/+$/, "");
    const normalized = (url: string) => url.replace(/\/+$/, "");
    const existing = userProviders.find(
      (entry) =>
        !isBuiltinEntryId(entry.id) &&
        normalized(entry.baseUrl) !== "" &&
        (normalized(entry.baseUrl) === base ||
          normalized(entry.baseUrl) === "https://openrouter.ai/api/v1"),
    );
    if (existing) {
      activeProviderId = existing.id;
    } else {
      const preset =
        VENDOR_PRESETS.find((candidate) => candidate.id === "openrouter") ?? {
          id: "openrouter",
          label: "OpenRouter",
          flavor: "openai-chat" as const,
          baseUrl: "https://openrouter.ai/api/v1",
        };
      const entry = providerFromPreset(preset);
      entry.apiKey = input.legacy.openrouter.apiKey;
      entry.model = input.legacy.openrouter.model;
      if (input.legacy.openrouter.baseUrl.trim()) {
        entry.baseUrl = input.legacy.openrouter.baseUrl;
      }
      entry.allowServerRelay = true;
      userProviders = [...userProviders, entry];
      activeProviderId = entry.id;
    }
    aiProvider = "openai";
  }

  if (!userProviders.some((entry) => entry.id === activeProviderId)) {
    const builtinForProvider: Record<string, string> = {
      openai: BUILTIN_ENTRY_IDS.openai,
      anthropic: BUILTIN_ENTRY_IDS.anthropic,
      gemini: BUILTIN_ENTRY_IDS.gemini,
      ollama: BUILTIN_ENTRY_IDS.ollama,
    };
    const fallback = builtinForProvider[aiProvider] ?? BUILTIN_ENTRY_IDS.gemini;
    activeProviderId = userProviders.some((entry) => entry.id === fallback)
      ? fallback
      : BUILTIN_ENTRY_IDS.gemini;
  }

  return { userProviders, activeProviderId, aiProvider };
}

/**
 * Vendor route key for a wire format's model list. Custom entries reuse the
 * vendor route of their format; only the format matters, never the label.
 */
export function modelProviderForFlavor(flavor: AiApiFlavor): AiProvider {
  switch (flavor) {
    case "anthropic-messages":
      return "anthropic";
    case "google-generate":
      return "gemini";
    default:
      return "openai";
  }
}
