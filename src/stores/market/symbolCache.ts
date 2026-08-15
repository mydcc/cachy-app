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

import { settingsState } from "../settings.svelte";

const DEFAULT_CACHE_SIZE = 20;
const TTL_MS = 5 * 60 * 1000;

export function getMaxCacheSize(): number {
  return settingsState.marketCacheSize || DEFAULT_CACHE_SIZE;
}

export interface CacheMetadata {
  lastAccessed: number;
  createdAt: number;
}

export class SymbolCache {
  public metadata = new Map<string, CacheMetadata>();
  private onEvict: (symbol: string) => void;

  constructor(onEvict: (symbol: string) => void) {
    this.onEvict = onEvict;
  }

  touch(symbol: string) {
    const now = Date.now();
    const existing = this.metadata.get(symbol);
    this.metadata.set(symbol, {
      lastAccessed: now,
      createdAt: existing?.createdAt || now,
    });
  }

  private evictLRU(): string | null {
    if (this.metadata.size === 0) return null;
    let oldest: string | null = null;
    let oldestTime = Infinity;
    this.metadata.forEach((meta, symbol) => {
      if (meta.lastAccessed < oldestTime) {
        oldestTime = meta.lastAccessed;
        oldest = symbol;
      }
    });
    if (oldest) {
      this.metadata.delete(oldest);
      return oldest;
    }
    return null;
  }

  enforceLimit(currentSize: number, getKeys: () => string[]) {
    const maxSize = getMaxCacheSize();
    let size = currentSize;
    while (size > maxSize) {
      const toEvict = this.evictLRU();
      if (!toEvict) {
        const keys = getKeys();
        const key = keys[0];
        if (key) {
          this.metadata.delete(key);
          this.onEvict(key);
        }
        break;
      }
      this.onEvict(toEvict);
      size--;
    }
  }

  cleanupStale() {
    const now = Date.now();
    const stale: string[] = [];
    this.metadata.forEach((meta, symbol) => {
      if (now - meta.lastAccessed > TTL_MS) stale.push(symbol);
    });
    stale.forEach((symbol) => {
      this.metadata.delete(symbol);
      this.onEvict(symbol);
    });
  }

  clear() {
    this.metadata.clear();
  }
}
