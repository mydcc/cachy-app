/*
 * Copyright (C) 2026 MYDCC
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

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_RUNTIME_CACHE_ENTRIES,
  RUNTIME_CACHE,
  isRuntimeCacheablePath,
  respondFromRuntimeCache,
  trimRuntimeCache,
} from "./runtimeCache";

/** A Cache stand-in that keeps insertion order, as the Cache API does. */
function fakeCache(): Cache & { store: Map<string, Response> } {
  const store = new Map<string, Response>();
  return {
    store,
    match: async (key: RequestInfo | URL) => store.get(String(key))?.clone(),
    put: async (key: RequestInfo | URL, response: Response) => {
      store.set(String(key), response);
    },
    keys: async () => [...store.keys()].map((key) => new Request(`https://cachy.test${key}`)),
    delete: async (key: RequestInfo | URL) => store.delete(new URL(String((key as Request).url ?? key)).pathname),
  } as unknown as Cache & { store: Map<string, Response> };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isRuntimeCacheablePath", () => {
  it("covers immutable build output and the physics engine, with or without a base path", () => {
    expect(isRuntimeCacheablePath("/_app/immutable/chunks/D50ODbxi.js")).toBe(true);
    expect(isRuntimeCacheablePath("/_app/immutable/workers/galaxy.worker-DXTZWlr3.js")).toBe(true);
    expect(isRuntimeCacheablePath("/ammo/ammo.wasm.wasm")).toBe(true);
    expect(isRuntimeCacheablePath("/cachy/_app/immutable/chunks/D50ODbxi.js")).toBe(true);
  });

  it("leaves everything else alone", () => {
    expect(isRuntimeCacheablePath("/")).toBe(false);
    expect(isRuntimeCacheablePath("/api/klines")).toBe(false);
    expect(isRuntimeCacheablePath("/fonts/Inter/Inter-VariableFont_opsz,wght.woff2")).toBe(false);
    expect(isRuntimeCacheablePath("/_app/version.json")).toBe(false);
  });
});

describe("trimRuntimeCache", () => {
  it("evicts the oldest entries first once the bound is exceeded", async () => {
    const cache = fakeCache();
    for (let i = 0; i < MAX_RUNTIME_CACHE_ENTRIES + 3; i++) {
      await cache.put(`/_app/immutable/chunks/${i}.js`, new Response(String(i)));
    }

    await trimRuntimeCache(cache);

    const kept = [...cache.store.keys()];
    expect(kept).toHaveLength(MAX_RUNTIME_CACHE_ENTRIES);
    expect(kept[0]).toBe("/_app/immutable/chunks/3.js");
    expect(kept.at(-1)).toBe(`/_app/immutable/chunks/${MAX_RUNTIME_CACHE_ENTRIES + 2}.js`);
  });

  it("deletes nothing at or below the bound", async () => {
    const cache = fakeCache();
    await cache.put("/ammo/ammo.wasm.js", new Response("a"));
    await trimRuntimeCache(cache, 1);
    expect(cache.store.size).toBe(1);
  });
});

describe("respondFromRuntimeCache", () => {
  function stubCaches(cache: Cache) {
    const open = vi.fn(async () => cache);
    vi.stubGlobal("caches", { open });
    return open;
  }

  it("stores a first use and serves the next request without the network", async () => {
    const cache = fakeCache();
    const open = stubCaches(cache);
    const fetchMock = vi.fn(async () => new Response("three", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const pending: Promise<unknown>[] = [];
    const path = "/_app/immutable/chunks/D50ODbxi.js";
    const request = new Request(`https://cachy.test${path}`);

    const first = await respondFromRuntimeCache(path, request, (work) => pending.push(work));
    await Promise.all(pending);
    const second = await respondFromRuntimeCache(path, request, (work) => pending.push(work));

    expect(open).toHaveBeenCalledWith(RUNTIME_CACHE);
    expect(await first.text()).toBe("three");
    expect(await second.text()).toBe("three");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("serves an unhashed file from the cache and refreshes it for the next use", async () => {
    const cache = fakeCache();
    stubCaches(cache);
    const path = "/ammo/ammo.wasm.js";
    await cache.put(path, new Response("ammo-v1"));
    vi.stubGlobal("fetch", vi.fn(async () => new Response("ammo-v2", { status: 200 })));
    const pending: Promise<unknown>[] = [];

    const response = await respondFromRuntimeCache(path, new Request(`https://cachy.test${path}`), (work) =>
      pending.push(work),
    );
    await Promise.all(pending);

    expect(await response.text()).toBe("ammo-v1");
    expect(await (await cache.match(path))!.text()).toBe("ammo-v2");
  });

  it("never revalidates a content-hashed chunk", async () => {
    const cache = fakeCache();
    stubCaches(cache);
    const path = "/_app/immutable/chunks/D50ODbxi.js";
    await cache.put(path, new Response("three"));
    const fetchMock = vi.fn(async () => new Response("other", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const pending: Promise<unknown>[] = [];

    await respondFromRuntimeCache(path, new Request(`https://cachy.test${path}`), (work) => pending.push(work));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(pending).toHaveLength(0);
  });

  it("keeps answering from the cache when the revalidation fails offline", async () => {
    const cache = fakeCache();
    stubCaches(cache);
    const path = "/ammo/ammo.wasm.wasm";
    await cache.put(path, new Response("ammo"));
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const pending: Promise<unknown>[] = [];

    const response = await respondFromRuntimeCache(path, new Request(`https://cachy.test${path}`), (work) =>
      pending.push(work),
    );

    await expect(Promise.all(pending)).resolves.toBeDefined();
    expect(await response.text()).toBe("ammo");
  });

  it("never stores a cross-origin response under a local key (FEAT-0265 review)", async () => {
    // A CORS-readable 200 from another origin would otherwise be cached as
    // "/ammo/ammo.wasm.js" and later executed as the app's own script.
    for (const type of ["cors", "opaque"] as const) {
      const cache = fakeCache();
      stubCaches(cache);
      const foreign = new Response("evil", { status: 200 });
      Object.defineProperty(foreign, "type", { value: type });
      vi.stubGlobal("fetch", vi.fn(async () => foreign));
      const pending: Promise<unknown>[] = [];
      const path = "/ammo/ammo.wasm.js";

      await respondFromRuntimeCache(path, new Request(`https://cachy.test${path}`), (work) => pending.push(work));
      await Promise.all(pending);

      expect(cache.store.size, type).toBe(0);
    }
  });

  it("does not store an error response", async () => {
    const cache = fakeCache();
    stubCaches(cache);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("gone", { status: 404 })));
    const pending: Promise<unknown>[] = [];
    const path = "/_app/immutable/chunks/old.js";

    const response = await respondFromRuntimeCache(path, new Request(`https://cachy.test${path}`), (work) =>
      pending.push(work),
    );

    expect(response.status).toBe(404);
    expect(pending).toHaveLength(0);
    expect(cache.store.size).toBe(0);
  });

  it("rethrows a network failure so the page's import rejects", async () => {
    stubCaches(fakeCache());
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    const path = "/ammo/ammo.wasm.wasm";

    await expect(
      respondFromRuntimeCache(path, new Request(`https://cachy.test${path}`), () => {}),
    ).rejects.toThrow("Failed to fetch");
  });
});
