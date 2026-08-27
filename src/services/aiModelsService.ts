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
  if (provider === "ollama") return opts.baseUrl || "default";
  if (provider === "openrouter") return "public";
  return opts.apiKey || "";
}

function cacheKey(provider: string, scope: string): string {
  return `${CACHE_PREFIX}${provider}_${shortHash(scope)}`;
}

function readCache(provider: string, scope: string): CacheEntry | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(cacheKey(provider, scope));
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
    localStorage.setItem(cacheKey(provider, scope), JSON.stringify(entry));
  } catch {
    // Quota exceeded or storage disabled — the model list simply won't cache.
  }
}

async function fetchFromServer(
  provider: string,
  opts: ModelFetchOptions,
): Promise<AiModelInfo[]> {
  const params = new URLSearchParams();
  if (provider === "ollama" && opts.baseUrl) params.set("baseUrl", opts.baseUrl);
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
 * Resolves the model list for a provider — from cache when fresh, from the
 * network otherwise, falling back to a stale cache entry if the network call
 * fails so a temporary outage doesn't empty the dropdown.
 *
 * For `anthropic`/`openai`/`gemini` without a credential yet, this resolves
 * to an empty list without making a request — there's nothing useful to ask
 * the provider until the user has entered a key. Pass `forceRefresh: true`
 * (the manual "test connection" action) to attempt it anyway and surface the
 * resulting error.
 */
export async function getModels(
  provider: string,
  opts: ModelFetchOptions,
  { forceRefresh = false }: { forceRefresh?: boolean } = {},
): Promise<{ models: AiModelInfo[]; fromCache: boolean }> {
  const scope = cacheScope(provider, opts);

  if (!forceRefresh && CREDENTIAL_PROVIDERS.has(provider) && !opts.apiKey) {
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
