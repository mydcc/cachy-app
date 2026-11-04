/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * Copyright (C) 2026 MYDCT
 *
 * Storage Service
 * Persists market data to IndexedDB for offline capability and extended history.
 */

import { browser } from "$app/env";
import { logger } from "./logger";
import type { Kline, SerializedKline } from "./technicalsTypes";
import { serializeKline, deserializeKline } from "./technicalsTypes";

const DB_NAME = "CachyDB";
const DB_VERSION = 2;
const STORE_KLINES = "klines_chunks";

export interface StoredKlines {
    id: string; // symbol:tf
    symbol: string;
    tf: string;
    data: SerializedKline[];
    lastUpdated: number;
}

class StorageService {
    private dbPromise: Promise<IDBDatabase> | null = null;
    private isSupported = false;
    private quotaWarned = false;

    constructor() {
        if (browser && "indexedDB" in window) {
            this.isSupported = true;
            this.initDB();
            void this.dbPromise?.catch(() => {});
        } else {
            logger.warn("general", "IndexedDB not supported or SSR environment");
        }
    }

    private initDB() {
        // PA-05: a rejected open must not leave a permanently rejected
        // promise behind. Reset to null on failure so the next getDB() retries.
        // Capture the promise so a stale rejection handler cannot clobber a
        // newer dbPromise (concurrency safety).
        const promise = new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => {
                logger.error("general", "Failed to open DB", (event.target as IDBOpenDBRequest).error);
                reject((event.target as IDBOpenDBRequest).error);
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (db.objectStoreNames.contains("klines")) {
                    db.deleteObjectStore("klines");
                }
                if (!db.objectStoreNames.contains(STORE_KLINES)) {
                    // Key: symbol:tf (e.g., "BTCUSDT:1h")
                    db.createObjectStore(STORE_KLINES, { keyPath: "id" });
                }
            };

            request.onsuccess = (event) => {
                resolve((event.target as IDBOpenDBRequest).result);
            };
        }).catch((err) => {
            if (this.dbPromise === promise) this.dbPromise = null;
            throw err;
        });
        this.dbPromise = promise;
    }

    private async getDB(): Promise<IDBDatabase> {
        if (!this.isSupported) throw new Error("IndexedDB not supported");
        if (!this.dbPromise) this.initDB();
        if (!this.dbPromise) throw new Error("IndexedDB not supported");
        return this.dbPromise;
    }

    /**
     * Merge and save klines.
     * Guaranteed to preserve existing history while updating with new data.
     */
    async saveKlines(symbol: string, tf: string, newKlines: Kline[]): Promise<void> {
        if (!this.isSupported || newKlines.length === 0) return;
        try {
            await this.saveKlinesOnce(symbol, tf, newKlines);
            this.quotaWarned = false;
        } catch (e) {
            if (isQuotaError(e)) {
                try {
                    await this.evictOldestChunk(symbol, tf);
                } catch (evictErr) {
                    logger.warn("general", "Best-effort eviction failed", evictErr);
                }
                if (!this.quotaWarned) {
                    this.quotaWarned = true;
                    logger.warn("general", "IndexedDB quota exceeded; evicted oldest kline chunks");
                }
                try {
                    await this.saveKlinesOnce(symbol, tf, newKlines);
                } catch (e2) {
                    logger.error("general", "Error saving klines", e2);
                }
            } else {
                logger.error("general", "Error saving klines", e);
            }
        }
    }

    async saveKlinesOnce(symbol: string, tf: string, newKlines: Kline[]): Promise<void> {
        if (!this.isSupported || newKlines.length === 0) return;

        const db = await this.getDB();

            // Group by chunk
            const chunks = new Map<string, Kline[]>();
            newKlines.forEach(k => {
                const chunkId = getChunkId(symbol, tf, k.time);
                if (!chunks.has(chunkId)) chunks.set(chunkId, []);
                chunks.get(chunkId)!.push(k);
            });

            const tx = db.transaction(STORE_KLINES, "readwrite");
            const store = tx.objectStore(STORE_KLINES);

            const txDone = new Promise<void>((resolve, reject) => {
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error ?? new Error("transaction aborted"));
            });

            const promises = Array.from(chunks.entries()).map(([chunkId, klines]) => {
                return new Promise<void>((resolve, reject) => {
                    const getReq = store.get(chunkId);

                    getReq.onsuccess = () => {
                        const existingRecord: StoredKlines = getReq.result;

                        // Optimize: Serialize new klines once
                        const serializedNewKlines = klines.map(serializeKline);
                        let finalData: SerializedKline[];

                        if (existingRecord && existingRecord.data) {
                            // Identify timestamps being updated/added
                            const newTimestamps = new Set(serializedNewKlines.map(k => k.time));

                            // Keep existing records that are NOT being updated
                            // This avoids deserializing the entire history chunk
                            const keptExisting = existingRecord.data.filter(k => !newTimestamps.has(k.time));

                            // Merge and sort by time (numeric sort on property)
                            finalData = [...keptExisting, ...serializedNewKlines].sort((a, b) => a.time - b.time);
                        } else {
                            finalData = serializedNewKlines.sort((a, b) => a.time - b.time);
                        }

                        const record: StoredKlines = {
                            id: chunkId,
                            symbol,
                            tf,
                            data: finalData,
                            lastUpdated: Date.now()
                        };

                        const putReq = store.put(record);
                        putReq.onsuccess = () => resolve();
                        putReq.onerror = () => reject(putReq.error);
                    };
                    getReq.onerror = () => reject(getReq.error);
                });
            });

            await Promise.all(promises);
            await txDone;
            this.logUsage();
    }

    async getKlines(symbol: string, tf: string): Promise<Kline[]> {
        if (!this.isSupported) return [];

        try {
            const db = await this.getDB();
            // Range query for chunks
            const startKey = `${symbol}:${tf}:`;
            const endKey = `${symbol}:${tf}:\uffff`;
            const range = IDBKeyRange.bound(startKey, endKey);

            const inner = new Promise<Kline[]>((resolve, reject) => {
                const tx = db.transaction(STORE_KLINES, "readonly");
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error ?? new Error("transaction aborted"));
                const store = tx.objectStore(STORE_KLINES);
                const req = store.getAll(range);

                req.onsuccess = () => {
                    const results: StoredKlines[] = req.result;
                    if (!results || results.length === 0) {
                        resolve([]);
                        return;
                    }
                    // Chunks are retrieved in key order (chronological), and data inside is sorted.
                    const allKlines = results.flatMap(r => r.data.map(deserializeKline));
                    resolve(allKlines);
                };

                req.onerror = () => reject(req.error);
            });
            return inner.catch((e) => {
                logger.error("general", "Error loading klines", e);
                return [];
            });
        } catch (e) {
            logger.error("general", "Error loading klines", e);
            return [];
        }
    }

    private async evictOldestChunk(symbol: string, tf: string): Promise<void> {
        if (!this.isSupported) return;
        const db = await this.getDB();
        const startKey = `${symbol}:${tf}:`;
        const endKey = `${symbol}:${tf}:\uffff`;
        const range = IDBKeyRange.bound(startKey, endKey);
        const ids: string[] = await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_KLINES, "readonly");
            const store = tx.objectStore(STORE_KLINES);
            const req = store.getAllKeys(range);
            req.onsuccess = () => resolve(req.result as string[]);
            req.onerror = () => reject(req.error);
        });
        if (ids.length === 0) return;
        ids.sort((a, b) => {
            const na = Number(a.split(":").pop() ?? 0);
            const nb = Number(b.split(":").pop() ?? 0);
            if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
            return a < b ? -1 : a > b ? 1 : 0;
        });
        const oldest = ids[0];
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_KLINES, "readwrite");
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error ?? new Error("transaction aborted"));
            const store = tx.objectStore(STORE_KLINES);
            const req = store.delete(oldest);
            req.onerror = () => reject(req.error);
        });
    }

    async logUsage() {
        if (typeof navigator === "undefined" || !navigator.storage || !navigator.storage.estimate) return;
        try {
            const estimate = await navigator.storage.estimate();
            const usedMB = (estimate.usage || 0) / 1024 / 1024;
            const quotaMB = (estimate.quota || 0) / 1024 / 1024;
            logger.log('data', `[Storage] Used: ${usedMB.toFixed(2)} MB / ${quotaMB.toFixed(0)} MB`);
        } catch (e) {
            logger.debug("general", "Storage estimate unavailable", e);
        }
    }

    async clearAll() {
        if (!this.isSupported) return;
        const db = await this.getDB();
        const tx = db.transaction(STORE_KLINES, "readwrite");
        await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error ?? new Error("transaction aborted"));
            tx.objectStore(STORE_KLINES).clear();
        });
    }

    /**
     * Closes the open database connection (if any) so an
     * indexedDB.deleteDatabase() is not blocked — used by the factory reset
     * (BUG-0288). Awaitable: callers can delete right after; reopens lazily
     * on next use.
     */
    async close(): Promise<void> {
        const opening = this.dbPromise;
        this.dbPromise = null;
        if (!opening) return;
        try {
            const db = await opening;
            db.close();
        } catch (e) {
            // already closed/failed — nothing to release
            logger.debug("general", "Storage handle close failed", e);
        }
    }
}


function isQuotaError(e: unknown): boolean {
    const err = e instanceof Event ? (e.target as { error?: unknown })?.error : e;
    if (!err) return false;
    if (err instanceof DOMException && err.name === "QuotaExceededError") return true;
    const name = (err as { name?: string })?.name;
    const code = (err as { code?: number })?.code;
    // Legacy Firefox / older engines
    if (name === "QuotaExceededError") return true;
    if (code === 22 || code === 1014) return true;
    return false;
}

// --- Helpers ---

function getIntervalMs(tf: string): number {
    const unit = tf.slice(-1);
    const value = parseInt(tf.slice(0, -1));
    if (isNaN(value)) return 60 * 1000; // Default 1m

    switch (unit) {
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        case 'd': return value * 24 * 60 * 60 * 1000;
        case 'w': return value * 7 * 24 * 60 * 60 * 1000;
        case 'M': return value * 30 * 24 * 60 * 60 * 1000; // Approx
        default: return 60 * 1000;
    }
}

function getChunkId(symbol: string, tf: string, time: number): string {
    const intervalMs = getIntervalMs(tf);
    // 1000 candles per chunk
    const chunkDuration = intervalMs * 1000;
    const chunkStart = Math.floor(time / chunkDuration) * chunkDuration;
    // Pad to 14 chars for lexicographical sorting (covers up to year 5138)
    return `${symbol}:${tf}:${chunkStart.toString().padStart(14, '0')}`;
}

export const storageService = new StorageService();
