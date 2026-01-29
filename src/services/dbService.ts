
/*
 * Copyright (C) 2026 MYDCT
 *
 * IndexedDB Wrapper for high-performance async storage.
 * Replaces localStorage for large datasets (News, Sentiment) to prevent UI blocking.
 */

import { logger } from "./logger";

const DB_NAME = "cachy_db";
const DB_VERSION = 1;

export class DBService {
    private db: IDBDatabase | null = null;
    private openPromise: Promise<IDBDatabase> | null = null;

    constructor() {
        // Lazy init in browser only
    }

    private async getDB(): Promise<IDBDatabase> {
        if (typeof window === "undefined" || !window.indexedDB) {
            throw new Error("IndexedDB not supported");
        }
        if (this.db) return this.db;
        if (this.openPromise) return this.openPromise;

        this.openPromise = new Promise((resolve, reject) => {
            const request = window.indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                logger.error("system", "[DB] Failed to open IndexedDB", request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                // Create object stores if they don't exist
                if (!db.objectStoreNames.contains("news")) {
                    db.createObjectStore("news", { keyPath: "id" }); // News Cache by Symbol/ID
                }
                if (!db.objectStoreNames.contains("sentiment")) {
                    db.createObjectStore("sentiment", { keyPath: "newsHash" }); // Sentiment Cache
                }
                if (!db.objectStoreNames.contains("kv_store")) {
                    db.createObjectStore("kv_store"); // General purpose key-value
                }
            };
        });

        return this.openPromise;
    }

    public async put(storeName: string, value: any, key?: string): Promise<void> {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, "readwrite");
            const store = tx.objectStore(storeName);
            const request = key ? store.put(value, key) : store.put(value);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    public async get<T>(storeName: string, key: string): Promise<T | undefined> {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, "readonly");
            const store = tx.objectStore(storeName);
            const request = store.get(key);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    public async delete(storeName: string, key: string): Promise<void> {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, "readwrite");
            const store = tx.objectStore(storeName);
            const request = store.delete(key);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    public async getAll<T>(storeName: string): Promise<T[]> {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, "readonly");
            const store = tx.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    public async getAllKeys(storeName: string): Promise<IDBValidKey[]> {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, "readonly");
            const store = tx.objectStore(storeName);
            const request = store.getAllKeys();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    public async clear(storeName: string): Promise<void> {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, "readwrite");
            const store = tx.objectStore(storeName);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
}

export const dbService = new DBService();
