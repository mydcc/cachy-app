/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { appFetch } from "../lib/appAuth";
import type { AiModelInfo } from "../types/ai";
import { buildDirectModelsRequest } from "../lib/ai/directRequest";
import type { AiApiFlavor } from "../stores/settings/aiProviders";
import { safeLocalStorage } from "../utils/storageWrapper";

export type { AiModelInfo };

interface CacheEntry {
  fetchedAt: number;
  models: AiModelInfo[];
}

interface ModelFetchOptions {
  apiKey?: string;
  baseUrl?: string;
}

const CACHE_PREFIX = "cachy_ai_models_";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — see settings.ai.refreshModels for the manual override

// Providers whose model list requires a credential to even attempt. Ollama
// needs a reachable base URL instead, and OpenRouter's catalog is public.
const CREDENTIAL_PROVIDERS = new Set(["anthropic", "openai", "gemini"]);

/**
 * Not a security measure — just enough entropy to give each API key its own
 * cache slot, so switching accounts doesn't show the previous account's
 * model list. The key itself is never written to localStorage.
 */
function shortHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function cacheScope(provider: string, opts: ModelFetchOptions): string {
  const parts = [opts.baseUrl || "", opts.apiKey || ""];
  if (provider === "openrouter" && !opts.baseUrl && !opts.apiKey) return "public";
  if (provider === "ollama" && !opts.baseUrl) return "default";
  return parts.filter(Boolean).join(":") || "default";
}

function cacheKey(provider: string, scope: string): string {
  return `${CACHE_PREFIX}${provider}_${shortHash(scope)}`;
}

function readCache(provider: string, scope: string): CacheEntry | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = safeLocalStorage.getItem(cacheKey(provider, scope));
    if (!raw) return null;
    return JSON.parse(raw) as CacheEntry;
  } catch {
    return null;
  }
}

function writeCache(provider: string, scope: string, models: AiModelInfo[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    const entry: CacheEntry = { fetchedAt: Date.now(), models };
    safeLocalStorage.setItem(cacheKey(provider, scope), JSON.stringify(entry));
  } catch {
    // Quota exceeded or storage disabled — the model list simply won't cache.
  }
}

async function fetchFromServer(
  provider: string,
  opts: ModelFetchOptions,
): Promise<AiModelInfo[]> {
  const params = new URLSearchParams();
  if (opts.baseUrl?.trim()) params.set("baseUrl", opts.baseUrl.trim());
  const qs = params.toString();

  const headers: Record<string, string> = {};
  if (opts.apiKey) headers["x-api-key"] = opts.apiKey;

  const res = await appFetch(`/api/ai/${provider}/models${qs ? `?${qs}` : ""}`, { headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed with status ${res.status}`);
  }

  const data = await res.json();
  return Array.isArray(data.models) ? data.models : [];
}

/**
 * The cached entry for a model, if the list was already fetched, without any
 * network call. Used to attach a cost estimate to a chat message when the
 * provider's catalog carried prices (e.g. OpenRouter).
 */
export function peekCachedModel(
  provider: string,
  opts: ModelFetchOptions,
  modelId: string,
): AiModelInfo | undefined {
  const cached = readCache(provider, cacheScope(provider, opts));
  return cached?.models.find((m) => m.id === modelId);
}

async function fetchDirectModels(
  flavor: AiApiFlavor,
  opts: ModelFetchOptions,
): Promise<AiModelInfo[]> {
  const { url, headers } = buildDirectModelsRequest(flavor, {
    baseUrl: opts.baseUrl?.trim() ?? "",
    apiKey: opts.apiKey ?? "",
  });
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Model list request failed with status ${res.status}`);
  }
  const data = (await res.json()) as {
    data?: Array<{ id?: unknown }>;
    models?: Array<{ name?: unknown; displayName?: unknown }>;
  };
  if (flavor === "google-generate") {
    const arr = Array.isArray(data.models) ? data.models : [];
    return arr
      .filter((m) => typeof m?.name === "string")
      .map((m) => {
        const id = (m.name as string).replace(/^models\//, "");
        return {
          id,
          label:
            typeof m.displayName === "string" && m.displayName
              ? m.displayName
              : id,
        };
      });
  }
  const arr = Array.isArray(data.data) ? data.data : [];
  return arr
    .filter((m) => typeof m?.id === "string")
    .map((m) => ({ id: m.id as string, label: m.id as string }));
}

/**
 * Resolves the model list for a provider — from cache when fresh, from the
 * network otherwise, falling back to a stale cache entry if the network call
 * fails so a temporary outage doesn't empty the dropdown.
 *
 * For `anthropic`/`openai`/`gemini` without a credential or custom baseUrl yet,
 * this resolves to an empty list without making a request — there's nothing useful
 * to ask the provider until the user has entered a key or endpoint. Pass `forceRefresh: true`
 * (the manual "test connection" action) to attempt it anyway and surface the
 * resulting error.
 */
export async function getModels(
  provider: string,
  opts: ModelFetchOptions,
  {
    forceRefresh = false,
    transport,
    flavor,
  }: {
    forceRefresh?: boolean;
    transport?: "server" | "direct";
    flavor?: AiApiFlavor;
  } = {},
): Promise<{ models: AiModelInfo[]; fromCache: boolean }> {
  const scope = cacheScope(provider, opts);

  if (!forceRefresh && CREDENTIAL_PROVIDERS.has(provider) && !opts.apiKey && !opts.baseUrl?.trim()) {
    return { models: [], fromCache: false };
  }

  if (!forceRefresh) {
    const cached = readCache(provider, scope);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return { models: cached.models, fromCache: true };
    }
  }

  // If provider is Ollama, attempt direct browser fetch first when possible
  if (provider === "ollama") {
    const baseUrl = (opts.baseUrl?.trim() || "http://localhost:11434").replace(/\/$/, "");
    try {
      const directRes = await fetch(`${baseUrl}/api/tags`);
      if (directRes.ok) {
        const data = await directRes.json();
        const models: AiModelInfo[] = ((data.models as { name: string }[]) || []).map((m) => ({
          id: m.name,
          label: m.name,
        }));
        writeCache(provider, scope, models);
        return { models, fromCache: false };
      }
    } catch {
      // Direct browser fetch to Ollama failed — fall through to server proxy
    }
  }

  // Browser-direct listing for custom and loopback providers: the key never
  // reaches Cachy's server. The caller picks the transport; loopback roots
  // must use it because the server proxy rejects reserved hosts by design.
  // Ollama keeps its `/api/tags` path above and never lands here.
  if (
    transport === "direct" &&
    flavor &&
    provider !== "ollama" &&
    opts.baseUrl?.trim()
  ) {
    try {
      const models = await fetchDirectModels(flavor, opts);
      writeCache(provider, scope, models);
      return { models, fromCache: false };
    } catch (e) {
      if (!forceRefresh) {
        const stale = readCache(provider, scope);
        if (stale) return { models: stale.models, fromCache: true };
      }
      throw e;
    }
  }

  try {
    const models = await fetchFromServer(provider, opts);
    writeCache(provider, scope, models);
    return { models, fromCache: false };
  } catch (e) {
    if (!forceRefresh) {
      const stale = readCache(provider, scope);
      if (stale) return { models: stale.models, fromCache: true };
    }
    throw e;
  }
}
