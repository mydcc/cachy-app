/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { checkAppAuth } from "../../../../lib/server/auth";
import { extractApiCredentials } from "../../../../utils/server/requestUtils";
import { NewsApiResponseSchema, CryptoPanicResponseSchema } from "../../../../types/newsSchemas";
import { sanitizeErrorMessage } from "../../../../types/apiSchemas";

// In-Memory Cache for News Proxy
interface CachedResponse {
  data: any;
  timestamp: number;
}

export const _newsCache = new Map<string, CachedResponse>();

// Rate Limiting
interface RateLimitInfo {
  count: number;
  resetTime: number;
}
export const _rateLimits = new Map<string, RateLimitInfo>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10;

const pendingRequests = new Map<string, Promise<any>>();
const CACHE_TTL = 60 * 60 * 1000; // 60 Minuten (erhöht für Quota-Schonung)
const MAX_CACHE_SIZE = 50;

function setCache(key: string, data: any) {
  if (_newsCache.has(key)) {
    _newsCache.delete(key);
  } else if (_newsCache.size >= MAX_CACHE_SIZE) {
    const oldest = _newsCache.keys().next().value;
    if (oldest !== undefined) _newsCache.delete(oldest);
  }
  _newsCache.set(key, { data, timestamp: Date.now() });
}

export const POST: RequestHandler = async ({ request, fetch }) => {
  const authError = checkAppAuth(request);
  if (authError) return authError;

  let cacheKey = "";
  let apiKey = "";

  try {
    const body = await request.json();
    const { source, params, plan } = body;

    // Extract API Key from Header (primary) or Body (fallback)
    const creds = extractApiCredentials(request, body);
    apiKey = creds.apiKey || body.apiKey;

    if (!apiKey) {
      return json({ error: "Missing API Key" }, { status: 400 });
    }

    // Cache key needs apiKey to isolate user quotas/plans
    cacheKey = `${source}:${JSON.stringify(params)}:${plan || "default"}:${apiKey}`;
    const now = Date.now();

    // Check Cache (before rate limiting so cached responses don't consume quota)
    const cached = _newsCache.get(cacheKey);
    if (cached && (now - cached.timestamp < CACHE_TTL)) {
      _newsCache.delete(cacheKey);
      _newsCache.set(cacheKey, cached);
      return json(cached.data);
    }

    // Rate Limit Check (only for requests that will hit upstream)
    const rateLimitKey = apiKey;

    const nowLimit = Date.now();

    // Memory Limit Check
    if (_rateLimits.size > 1000) {
      // Evict expired entries
      const expiredKeys = Array.from(_rateLimits.entries())
        .filter(([_, info]) => nowLimit > info.resetTime)
        .map(([k]) => k);
      expiredKeys.forEach(k => _rateLimits.delete(k));

      // If still too large, forcefully clear
      if (_rateLimits.size > 1000) {
        const toDelete = Array.from(_rateLimits.keys()).slice(0, 100);
        toDelete.forEach(k => _rateLimits.delete(k));
      }
    }

    // Re-read after potential eviction to avoid stale references
    const userLimit = _rateLimits.get(rateLimitKey);

    if (!userLimit || nowLimit > userLimit.resetTime) {
      _rateLimits.set(rateLimitKey, { count: 1, resetTime: nowLimit + RATE_LIMIT_WINDOW });
    } else {
      if (userLimit.count >= MAX_REQUESTS_PER_WINDOW) {
        return json({ error: "Rate limit exceeded. Please try again later." }, { status: 429 });
      }
      userLimit.count++;
    }

    if (pendingRequests.has(cacheKey)) {
      try {
        const data = await pendingRequests.get(cacheKey);
        return json(data);
      } catch (e: any) {
        // Fallthrough
      }
    }

    const executeRequest = async () => {
      if (source === "cryptopanic") {
        const query = new URLSearchParams(params).toString();
        const plans: ("developer" | "growth" | "enterprise")[] = [
          "developer",
          "growth",
          "enterprise",
        ];

        if (plan && plans.includes(plan)) {
          const idx = plans.indexOf(plan);
          plans.splice(idx, 1);
          plans.unshift(plan);
        }

        let lastError = "";
        for (const p of plans) {
          // CryptoPanic requires auth_token in query.
          // Logging handles redaction via logger.ts usually, but here we construct it manually.
          const url = `https://cryptopanic.com/api/${p}/v2/posts/?auth_token=${apiKey}&${query}`;
          try {
            const response = await fetch(url);
            if (response.ok) {
              const rawData = await response.json();
              // Validate Schema
              const validation = CryptoPanicResponseSchema.safeParse(rawData);
              if (!validation.success) {
                   console.warn("[NewsProxy] Schema Validation Warning:", validation.error);
                   // Proceed with best effort or throw?
                   // Given it's a proxy, invalid schema might break UI. Best to sanitize or just pass if 'results' exists.
                   // The prompt asked for Strict Schema Validation.
                   // If schema fails, we treat it as an error.
                   throw new Error("Upstream response failed schema validation");
              }
              const data = validation.data;
              setCache(cacheKey, data);
              return data;
            }
            if (response.status === 429) {
              const errorText = await response.text();
              throw new Error(`Upstream error (${p}): 429 - ${errorText}`);
            }
            if (response.status === 404) {
              lastError = `404 Not Found for plan: ${p}`;
              continue;
            }
            const errorText = await response.text();
            throw new Error(`Upstream error (${p}): ${response.status} - ${errorText}`);
          } catch (e: any) {
            let msg = e.message || String(e);
            if (apiKey && apiKey.length > 4) {
              msg = msg.split(apiKey).join("***");
            }
            const is429 = msg.includes("429");
            msg = sanitizeErrorMessage(msg);

            if (is429) throw new Error(msg);
            console.warn(`[NewsProxy] Plan ${p} failed:`, msg);
            lastError = msg;
            continue;
          }
        }
        throw new Error(`Could not find valid CryptoPanic endpoint. Last Error: ${lastError}`);
      } else if (source === "newsapi") {
        const query = new URLSearchParams(params).toString();
        // NewsAPI supports X-Api-Key header. Much safer.
        const url = `https://newsapi.org/v2/everything?${query}`;
        const response = await fetch(url, {
             headers: {
                 "X-Api-Key": apiKey
             }
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Upstream error (NewsAPI): ${response.status} - ${errorText}`);
        }
        const rawData = await response.json();
        const validation = NewsApiResponseSchema.safeParse(rawData);
        if (!validation.success) {
             console.warn("[NewsProxy] NewsAPI Schema Validation Warning:", validation.error);
             throw new Error("Upstream response failed schema validation");
        }
        const data = validation.data;
        setCache(cacheKey, data);
        return data;
      } else {
        throw new Error("Invalid source");
      }
    };

    const requestPromise = executeRequest();
    pendingRequests.set(cacheKey, requestPromise);

    try {
      const data = await requestPromise;
      return json(data);
    } finally {
      pendingRequests.delete(cacheKey);
    }

  } catch (err: any) {
    let errorMsg = err instanceof Error ? err.message : String(err);
    if (apiKey && apiKey.length > 4) {
      errorMsg = errorMsg.split(apiKey).join("***");
    }
    const isQuotaError = errorMsg.includes("429") || errorMsg.includes("quota");
    errorMsg = sanitizeErrorMessage(errorMsg);

    // Safe logging: Don't log full URL if it has keys
    console.error(`[NewsProxy] Error processing request for ${request.url}:`, errorMsg);

    if (err.cause) console.error("[NewsProxy] Cause:", err.cause);

    if (isQuotaError) {
      const staleCache = _newsCache.get(cacheKey);
      if (staleCache) {
        console.warn("[NewsProxy] Using stale cache due to quota exhaustion");
        return json(staleCache.data);
      }
    }

    return json(
      { error: errorMsg || "Internal Proxy Error" },
      { status: 500 },
    );
  }
};
