/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { appFetch } from "../lib/appAuth";

const STORAGE_KEY = "cachy_frame_support_cache";

// Known seeds to avoid initial latency
const KNOWN_SEEDS: Record<string, boolean> = {
  "coindesk.com": false,
  "theblock.co": false,
  "decrypt.co": false,
  "bitcoinmagazine.com": false,
  "bitcoin-kurier.de": false,
  "bloomberg.com": false,
  "wsj.com": false,
  "reuters.com": false,
  "yahoo.com": false,
  "finance.yahoo.com": false,
  "marketwatch.com": false,
  "cnbc.com": false,
  "ft.com": false,
  "forbes.com": false,
  "cointelegraph.com": true,
  "space.cachy.app": true,
  "cachy.app": true,
};

class FrameSupportService {
  private cache: Map<string, boolean> = new Map();
  private pendingChecks: Set<string> = new Set();

  constructor() {
    this.loadCache();
  }

  private loadCache() {
    // Populate seeds
    for (const [domain, supported] of Object.entries(KNOWN_SEEDS)) {
      this.cache.set(domain, supported);
    }

    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (typeof parsed === "object" && parsed !== null) {
            for (const [k, v] of Object.entries(parsed)) {
              if (typeof v === "boolean") {
                this.cache.set(k, v);
              }
            }
          }
        }
      } catch {
        // Ignore parsing errors
      }
    }
  }

  private saveCache() {
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const obj: Record<string, boolean> = {};
        for (const [k, v] of this.cache.entries()) {
          obj[k] = v;
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
      } catch {
        // Ignore storage errors
      }
    }
  }

  public getDomain(urlStr: string): string {
    try {
      return new URL(urlStr).hostname.toLowerCase();
    } catch {
      return urlStr.toLowerCase();
    }
  }

  public isDomainFrameBlocked(urlStr: string): boolean {
    const domain = this.getDomain(urlStr);

    // Check direct domain or parent domain
    for (const [cachedDomain, supported] of this.cache.entries()) {
      if (domain === cachedDomain || domain.endsWith("." + cachedDomain)) {
        return !supported;
      }
    }

    // If not known yet, trigger background check
    this.checkDomainSupport(urlStr);

    // Default to false (not blocked) until confirmed
    return false;
  }

  public isDomainFrameSupported(urlStr: string): boolean {
    return !this.isDomainFrameBlocked(urlStr);
  }

  public async checkDomainSupport(urlStr: string): Promise<boolean> {
    const domain = this.getDomain(urlStr);
    if (!domain || this.cache.has(domain) || this.pendingChecks.has(domain)) {
      return this.cache.get(domain) ?? true;
    }

    this.pendingChecks.add(domain);

    try {
      const res = await appFetch(
        `/api/external/check-frame-support?url=${encodeURIComponent(urlStr)}`,
      );
      if (res.ok) {
        const data = await res.json();
        if (typeof data.supportsIframe === "boolean") {
          this.cache.set(domain, data.supportsIframe);
          this.saveCache();
          return data.supportsIframe;
        }
      }
    } catch {
      // Fallback
    } finally {
      this.pendingChecks.delete(domain);
    }

    return true;
  }
}

export const frameSupportService = new FrameSupportService();
