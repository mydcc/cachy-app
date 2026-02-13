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

import { browser } from "$app/environment";
import { logger } from "./logger";
import type { Kline, SerializedKline } from "./technicalsTypes";
import { serializeKline, deserializeKline } from "./technicalsTypes";

const DB_NAME = "CachyDB";
const DB_VERSION = 1;
const STORE_KLINES = "klines";
const MAX_STORED_KLINES = 50000;

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

    constructor() {
        if (browser && "indexedDB" in window) {
            this.isSupported = true;
            this.initDB();
        } else {
            logger.warn("general", "IndexedDB not supported or SSR environment");
        }
    }

    private initDB() {
        this.dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => {
                logger.error("general", "Failed to open DB", (event.target as any).error);
                reject((event.target as any).error);
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(STORE_KLINES)) {
                    // Key: symbol:tf (e.g., "BTCUSDT:1h")
                    db.createObjectStore(STORE_KLINES, { keyPath: "id" });
                }
            };

            request.onsuccess = (event) => {
                resolve((event.target as IDBOpenDBRequest).result);
            };
        });
    }

    private async getDB(): Promise<IDBDatabase> {
        if (!this.isSupported) throw new Error("IndexedDB not supported");
        if (!this.dbPromise) this.initDB();
        return this.dbPromise!;
    }

    /**
     * Merge and save klines.
     * Guaranteed to preserve existing history while updating with new data.
     */
    async saveKlines(symbol: string, tf: string, newKlines: Kline[]): Promise<void> {
        if (!this.isSupported || newKlines.length === 0) return;

        try {
            const db = await this.getDB();
            const id = `${symbol}:${tf}`;

            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_KLINES, "readwrite");
                const store = tx.objectStore(STORE_KLINES);

                const getReq = store.get(id);

                getReq.onsuccess = () => {
                    const existingRecord: StoredKlines = getReq.result;
                    let mergedData: Kline[];

                    if (existingRecord && existingRecord.data) {
                        // Merge Strategy: Map by time to deduplicate
                        const map = new Map<number, Kline>();
                        existingRecord.data.forEach(k => map.set(k.time, deserializeKline(k)));
                        newKlines.forEach(k => map.set(k.time, k));

                        // Sort by time
                        mergedData = Array.from(map.values()).sort((a, b) => a.time - b.time);
                    } else {
                        mergedData = [...newKlines].sort((a, b) => a.time - b.time);
                    }

                    // Hard Limit for Storage
                    if (mergedData.length > MAX_STORED_KLINES) {
                        mergedData = mergedData.slice(-MAX_STORED_KLINES);
                    }

                    const record: StoredKlines = {
                        id,
                        symbol,
                        tf,
                        data: mergedData.map(serializeKline),
                        lastUpdated: Date.now()
                    };

                    const putReq = store.put(record);
                    putReq.onsuccess = () => {
                        this.logUsage();
                        resolve();
                    };
                    putReq.onerror = () => reject(putReq.error);
                };

                getReq.onerror = () => reject(getReq.error);
            });
        } catch (e) {
            logger.error("general", "Error saving klines", e);
        }
    }

    async getKlines(symbol: string, tf: string): Promise<Kline[]> {
        if (!this.isSupported) return [];

        try {
            const db = await this.getDB();
            const id = `${symbol}:${tf}`;

            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_KLINES, "readonly");
                const store = tx.objectStore(STORE_KLINES);
                const req = store.get(id);

                req.onsuccess = () => {
                    const result: StoredKlines = req.result;
                    resolve(result ? result.data.map(deserializeKline) : []);
                };

                req.onerror = () => reject(req.error);
            });
        } catch (e) {
            logger.error("general", "Error loading klines", e);
            return [];
        }
    }

    async logUsage() {
        if (navigator.storage && navigator.storage.estimate) {
            try {
                const estimate = await navigator.storage.estimate();
                const usedMB = (estimate.usage || 0) / 1024 / 1024;
                const quotaMB = (estimate.quota || 0) / 1024 / 1024;
                logger.log('data', `[Storage] Used: ${usedMB.toFixed(2)} MB / ${quotaMB.toFixed(0)} MB`);
            } catch (e) {
                // ignore
            }
        }
    }

    async clearAll() {
        if (!this.isSupported) return;
        const db = await this.getDB();
        const tx = db.transaction(STORE_KLINES, "readwrite");
        tx.objectStore(STORE_KLINES).clear();
    }
}

export const storageService = new StorageService();
