/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * RSS Feed Preset Configuration
 *
 * Curated list of high-quality RSS feeds for crypto/trading news.
 * These feeds are pre-configured for one-click activation in settings.
 */

export interface RssPreset {
  id: string;
  name: string;
  url: string;
  category: "crypto" | "trading" | "macro";
  description?: string;
}

export const RSS_PRESETS: RssPreset[] = [
  {
    id: "coindesk",
    name: "CoinDesk",
    url: "https://www.coindesk.com/arc/outboundfeeds/rss/",
    category: "crypto",
    description: "Leading crypto news and analysis",
  },
  {
    id: "cointelegraph",
    name: "Cointelegraph",
    url: "https://cointelegraph.com/rss",
    category: "crypto",
    description: "Breaking crypto news and blockchain insights",
  },
  {
    id: "decrypt",
    name: "Decrypt",
    url: "https://decrypt.co/feed",
    category: "crypto",
    description: "Crypto news with Web3 focus",
  },
  {
    id: "theblock",
    name: "The Block",
    url: "https://www.theblock.co/rss.xml",
    category: "crypto",
    description: "Research-driven crypto journalism",
  },
  {
    id: "bitcoinmagazine",
    name: "Bitcoin Magazine",
    url: "https://bitcoinmagazine.com/.rss/full/",
    category: "crypto",
    description: "Bitcoin-focused news and education",
  },
];

/**
 * Get all preset URLs for given IDs (Optimized for performance)
 * uses a single pass loop which is faster than filter/map or Set for small arrays.
 */
export const getRSSUrlsByIds = (ids: string[]): string[] => {
  const urls: string[] = [];
  for (const p of RSS_PRESETS) {
    if (ids.includes(p.id)) {
      urls.push(p.url);
    }
  }
  return urls;
};

/**
 * Get preset by ID
 */
export function getPresetById(id: string): RssPreset | undefined {
  return RSS_PRESETS.find((p) => p.id === id);
}

/**
 * Get all preset URLs for given IDs
 */
export function getPresetUrls(ids: string[], presets: RssPreset[] = RSS_PRESETS): string[] {
  if (ids.length === 0) {
    return [];
  }

  // Optimization:
  // Benchmark shows Set creation overhead makes it slower than linear scan
  // for small preset lists. The crossover point is around 15 items.
  // (Previous threshold was 50, but benchmarking refined this to 15).
  if (presets.length < 15) {
    const urls: string[] = [];
    for (const p of presets) {
      if (ids.includes(p.id)) {
        urls.push(p.url);
      }
    }
    return urls;
  }

  // For larger lists, using a Set for O(1) lookups is significantly faster
  // despite the initial creation cost.
  const idsSet = new Set(ids);
  const urls: string[] = [];

  for (const p of presets) {
    if (idsSet.has(p.id)) {
      urls.push(p.url);
    }
  }

  return urls;
}
