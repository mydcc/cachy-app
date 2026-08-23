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

/**
 * Full local teardown for the settings "Factory Reset".
 *
 * BUG-0288: reset used to run localStorage.clear() only, so the crypto
 * device key (CachySecurityDB), the news/sentiment/kv caches (cachy_db)
 * and the kline history (CachyDB) survived "delete everything" in IndexedDB,
 * alongside any service-worker Cache Storage entries.
 */

import { logger } from "../services/logger";
import { dbService } from "../services/dbService";
import { storageService } from "../services/storageService";

// Fallback for browsers without indexedDB.databases(); kept in sync with
// DB_NAME in dbService.ts / storageService.ts and SECURE_DB_NAME in
// cryptoService.ts.
const KNOWN_DB_NAMES = ["cachy_db", "CachyDB", "CachySecurityDB"];

function deleteDatabase(name: string): Promise<void> {
    return new Promise((resolve) => {
        let request: IDBOpenDBRequest;
        try {
            request = indexedDB.deleteDatabase(name);
        } catch {
            resolve();
            return;
        }
        // Best effort per database: a blocked or failing deletion must never
        // hang or abort the rest of the reset.
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
    });
}

async function clearIndexedDb(): Promise<void> {
    if (typeof indexedDB === "undefined") return;

    // Open connections block deleteDatabase until they close, so release the
    // ones this tab keeps alive before asking for deletion. Awaitable so the
    // deletion cannot race an in-flight close.
    try {
        dbService.close();
        await storageService.close();
    } catch {
        // Closing is an optimization; deletion below stays best effort.
    }

    let names: string[] = KNOWN_DB_NAMES;
    try {
        const infos = await indexedDB.databases();
        const found = infos
            .map((info) => info.name)
            .filter((name): name is string => typeof name === "string");
        if (found.length > 0) names = found;
    } catch {
        // Enumeration unsupported/failed -> fall back to the known names.
    }

    await Promise.all(names.map(deleteDatabase));
}

async function clearCacheStorage(): Promise<void> {
    if (typeof caches === "undefined") return;
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
}

/**
 * Deletes every piece of local data: localStorage, all IndexedDB databases
 * of this origin and Cache Storage entries. Each layer is best effort;
 * localStorage always completes first so a factory reset still works when
 * IndexedDB is unavailable.
 */
export async function wipeLocalData(): Promise<void> {
    try {
        localStorage.clear();
    } catch (error) {
        logger.error("general", "[Reset] Failed to clear localStorage", error);
    }

    try {
        await clearIndexedDb();
    } catch (error) {
        logger.error("general", "[Reset] Failed to clear IndexedDB", error);
    }

    try {
        await clearCacheStorage();
    } catch (error) {
        logger.error("general", "[Reset] Failed to clear Cache Storage", error);
    }
}
