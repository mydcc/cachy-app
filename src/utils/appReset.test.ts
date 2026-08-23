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

import { describe, expect, it, vi } from "vitest";
import { wipeLocalData } from "./appReset";

// BUG-0288: factory reset must reach every browser-storage layer, verified
// against fake-indexeddb (polyfilled globally in vitest.setup.ts).

function createDb(name: string): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onupgradeneeded = () => {
            request.result.createObjectStore("kv_store");
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function databaseNames(): Promise<(string | null)[]> {
    return (await indexedDB.databases()).map((info) => info.name);
}

describe("wipeLocalData", () => {
    it("deletes all app IndexedDB databases and clears localStorage", async () => {
        localStorage.setItem("cachy_settings", "{}");
        for (const name of ["cachy_db", "CachyDB", "CachySecurityDB"]) {
            const db = await createDb(name);
            db.close();
        }

        await wipeLocalData();

        const names = await databaseNames();
        expect(names).not.toContain("cachy_db");
        expect(names).not.toContain("CachyDB");
        expect(names).not.toContain("CachySecurityDB");
        expect(localStorage.length).toBe(0);
    });

    it("also removes databases discovered by enumeration beyond the known set", async () => {
        const db = await createDb("future_cache_db");
        db.close();

        await wipeLocalData();

        const names = await databaseNames();
        expect(names).not.toContain("future_cache_db");
    });

    it("still clears localStorage when IndexedDB is unavailable", async () => {
        localStorage.setItem("trade_journal", "[1]");
        vi.stubGlobal("indexedDB", undefined);

        try {
            await expect(wipeLocalData()).resolves.toBeUndefined();
            expect(localStorage.length).toBe(0);
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
