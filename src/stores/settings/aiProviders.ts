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
