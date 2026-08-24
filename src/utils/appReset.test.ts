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
import { dbService } from "../services/dbService";
import { storageService } from "../services/storageService";
import {
    registerResetCoordinator,
    RESET_CHANNEL_NAME,
    wipeLocalData,
} from "./appReset";

// BUG-0288: factory reset must reach every browser-storage layer, verified
// against fake-indexeddb (polyfilled globally in vitest.setup.ts).
// BUG-0294: deletion stays pending while any connection is open — including
// connections held by other tabs — so tabs coordinate over a BroadcastChannel.

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

/**
 * Deterministic stand-in for the browser's cross-tab channel: instances share
 * a registry and delivery is synchronous, so a wipe's ping reaches listeners
 * before the grace timer fires without any real timing dependence.
 */
class FakeBroadcastChannel {
    static instances: FakeBroadcastChannel[] = [];

    static reset(): void {
        FakeBroadcastChannel.instances = [];
    }

    onmessage: ((event: MessageEvent) => void) | null = null;
    closed = false;

    constructor(public name: string) {
        FakeBroadcastChannel.instances.push(this);
    }

    postMessage(data: unknown): void {
        const event = new MessageEvent("message", { data });
        for (const channel of [...FakeBroadcastChannel.instances]) {
            if (channel !== this && !channel.closed) channel.onmessage?.(event);
        }
    }

    close(): void {
        this.closed = true;
    }
}

function stubFakeChannel(): void {
    FakeBroadcastChannel.reset();
    // Plain assignment instead of vi.stubGlobal: unstubAllGlobals() also
    // tears down the setup-file's localStorage/indexedDB stubs, which breaks
    // every later test in this file (observed as "Cannot read properties of
    // undefined (reading 'setItem')").
    (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel =
        FakeBroadcastChannel;
}

function restoreBroadcastChannel(original: unknown): void {
    (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = original;
    FakeBroadcastChannel.reset();
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
        const originalIndexedDB = globalThis.indexedDB;
        delete (globalThis as { indexedDB?: unknown }).indexedDB;

        try {
            await expect(wipeLocalData()).resolves.toBeUndefined();
            expect(localStorage.length).toBe(0);
        } finally {
            (globalThis as { indexedDB?: unknown }).indexedDB = originalIndexedDB;
        }
    });

    // --- BUG-0294: multi-tab coordination ---

    it("still completes when BroadcastChannel is unsupported", async () => {
        const blocker = await createDb("cachy_db");
        localStorage.setItem("cachy_settings", "{}");
        const originalChannel = globalThis.BroadcastChannel;
        (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = undefined;

        try {
            const start = Date.now();
            await wipeLocalData();

            expect(Date.now() - start).toBeLessThan(5000);
            expect(localStorage.length).toBe(0);
        } finally {
            blocker.close();
            restoreBroadcastChannel(originalChannel);
        }
    });

    it("resolves in bounded time when a non-cooperating tab keeps a connection open", async () => {
        stubFakeChannel();
        // A raw connection no ping will ever release — like an old tab from
        // before the coordinator existed. The deletion stays pending forever;
        // the reset must degrade to a no-op for it instead of hanging.
        const siblingConnection = await createDb("cachy_db");

        try {
            const start = Date.now();
            await wipeLocalData();

            expect(Date.now() - start).toBeLessThan(5000);
            expect(await databaseNames()).toContain("cachy_db");
        } finally {
            siblingConnection.close();
            restoreBroadcastChannel(FakeBroadcastChannel);
        }
    });

    it("deletes the database when a simulated sibling releases it on the ping", async () => {
        stubFakeChannel();
        const siblingConnection = await createDb("cachy_db");

        // Stands in for another realm's registerResetCoordinator(): reacts to
        // the product-posted ping exactly like a real sibling tab would.
        const sibling = new FakeBroadcastChannel(RESET_CHANNEL_NAME);
        sibling.onmessage = () => siblingConnection.close();

        let pingsReceived = 0;
        const observer = new FakeBroadcastChannel(RESET_CHANNEL_NAME);
        observer.onmessage = () => {
            pingsReceived += 1;
        };

        try {
            await wipeLocalData();

            expect(pingsReceived).toBe(1);
            expect(await databaseNames()).not.toContain("cachy_db");
        } finally {
            sibling.close();
            observer.close();
            restoreBroadcastChannel(FakeBroadcastChannel);
        }
    });

    it("coordinator releases this tab's service connections on a reset ping", async () => {
        stubFakeChannel();

        const closeDbSpy = vi.spyOn(dbService, "close");
        const closeStorageSpy = vi
            .spyOn(storageService, "close")
            .mockResolvedValue(undefined);
        const dispose = registerResetCoordinator();

        const sender = new FakeBroadcastChannel(RESET_CHANNEL_NAME);
        sender.postMessage({ type: "cachy-reset" });
        expect(closeDbSpy).toHaveBeenCalledTimes(1);
        expect(closeStorageSpy).toHaveBeenCalledTimes(1);

        closeDbSpy.mockClear();
        sender.postMessage({ type: "something-else" });
        expect(closeDbSpy).not.toHaveBeenCalled();

        dispose();
        closeDbSpy.mockRestore();
        closeStorageSpy.mockRestore();
        sender.close();
        restoreBroadcastChannel(FakeBroadcastChannel);
    });
});
