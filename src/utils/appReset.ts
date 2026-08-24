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
 *
 * BUG-0294: per spec, an indexedDB.deleteDatabase() stays pending while ANY
 * connection to that database is open — including connections held by other
 * tabs, which are separate JS realms this module cannot close directly. Tabs
 * therefore coordinate over a BroadcastChannel: every tab registers a listener
 * at startup (registerResetCoordinator) that releases its connections when a
 * reset ping arrives, and the resetting tab pings and waits a short bounded
 * grace period before asking for deletion. Without coordination a blocked
 * deletion degrades to a no-op exactly as before — best-effort semantics are
 * kept either way.
 */

import { logger } from "../services/logger";
import { dbService } from "../services/dbService";
import { storageService } from "../services/storageService";

// Fallback for browsers without indexedDB.databases(); kept in sync with
// DB_NAME in dbService.ts / storageService.ts and SECURE_DB_NAME in
// cryptoService.ts.
const KNOWN_DB_NAMES = ["cachy_db", "CachyDB", "CachySecurityDB"];

// Dedicated channel for factory-reset coordination between tabs.
export const RESET_CHANNEL_NAME = "cachy-reset";

// Bounded window for sibling tabs to react to the reset ping: long enough for
// their message handlers to run on their own event loop, short enough to never
// stall a reset noticeably. There is no completion signal to wait on, so the
// resetting tab cannot observe whether a sibling actually closed — hence a
// fixed window instead of an unbounded wait.
const RESET_GRACE_MS = 150;

interface ResetPing {
    type: "cachy-reset";
}

function isResetPing(data: unknown): data is ResetPing {
    return (
        typeof data === "object" &&
        data !== null &&
        (data as { type?: unknown }).type === "cachy-reset"
    );
}

/**
 * Listens for reset pings from sibling tabs and releases this tab's IndexedDB
 * connections when one arrives, so a factory reset in another tab can delete
 * the shared databases (BUG-0294). Returns a dispose function; safe to call
 * repeatedly. Degrades to a no-op when BroadcastChannel is unavailable.
 */
export function registerResetCoordinator(): () => void {
    if (typeof BroadcastChannel === "undefined") return () => {};

    let channel: BroadcastChannel;
    try {
        channel = new BroadcastChannel(RESET_CHANNEL_NAME);
    } catch {
        return () => {};
    }

    channel.onmessage = (event: MessageEvent) => {
        if (!isResetPing(event.data)) return;
        try {
            // Closing initiates synchronously; the resetting tab waits out the
            // grace period either way, so no completion tracking is needed.
            dbService.close();
            void storageService.close();
        } catch (error) {
            logger.error(
                "general",
                "[Reset] Failed to release connections for sibling reset",
                error,
            );
        }
    };

    return () => {
        channel.onmessage = null;
        channel.close();
    };
}

/**
 * Pings sibling tabs to release their IndexedDB connections and waits the
 * bounded grace period. Best effort in every direction: without
 * BroadcastChannel this resolves immediately, and a throwing constructor or
 * postMessage never aborts the reset.
 */
async function requestSiblingClose(): Promise<void> {
    if (typeof BroadcastChannel === "undefined") return;

    let channel: BroadcastChannel;
    try {
        channel = new BroadcastChannel(RESET_CHANNEL_NAME);
    } catch {
        return;
    }

    try {
        channel.postMessage({ type: "cachy-reset" } satisfies ResetPing);
        await new Promise((resolve) => setTimeout(resolve, RESET_GRACE_MS));
    } finally {
        channel.close();
    }
}

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

    // BUG-0294: ask sibling tabs to drop their IndexedDB connections before
    // the deletion requests below, otherwise every deletion stays pending for
    // as long as any sibling holds a connection.
    try {
        await requestSiblingClose();
    } catch (error) {
        logger.error("general", "[Reset] Failed to coordinate sibling tabs", error);
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
