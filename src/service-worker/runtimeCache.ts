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

/**
 * FEAT-0265: the on-demand cache for files the precache leaves out (three.js,
 * its two workers, `ammo/`). `docs/TODO.md` §13 removed the earlier, unused
 * runtime cache and named the condition for bringing one back — a concrete
 * offline use case. This is it: an effect used once while online stays usable
 * offline.
 *
 * Deliberately not keyed by the build version: every file in scope carries a
 * content hash or is a vendored binary, so an entry stays correct across
 * deploys and the next release does not download it again.
 */

export const RUNTIME_CACHE = "runtime-lazy";
export const MAX_RUNTIME_CACHE_ENTRIES = 50;

/** `_app/immutable/*` and `/ammo/*`, after any configured base path. */
const RUNTIME_SCOPE = /\/(_app\/immutable|ammo)\//;

export function isRuntimeCacheablePath(pathname: string): boolean {
  return RUNTIME_SCOPE.test(pathname);
}

/**
 * FIFO eviction in `cache.keys()` order, which is insertion order. Nothing
 * re-inserts a hit (the lookup is cache-first), so first-in is also the
 * oldest first use.
 */
export async function trimRuntimeCache(cache: Cache, max = MAX_RUNTIME_CACHE_ENTRIES): Promise<void> {
  const keys = await cache.keys();
  const excess = keys.length - max;
  for (const key of keys.slice(0, Math.max(0, excess))) {
    await cache.delete(key);
  }
}

/**
 * Cache-first lookup for an in-scope file. A miss goes to the network and a
 * 200 is stored without delaying the response; `keepAlive` holds the service
 * worker open until the write and the trim are done. A network failure is
 * rethrown — the caller's import then rejects, and the page decides how to
 * report it.
 */
export async function respondFromRuntimeCache(
  pathname: string,
  request: Request,
  keepAlive: (work: Promise<unknown>) => void,
): Promise<Response> {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(pathname);
  if (cached) return cached;

  const response = await fetch(request);
  if (response instanceof Response && response.status === 200) {
    const copy = response.clone();
    keepAlive(
      cache
        .put(pathname, copy)
        .then(() => trimRuntimeCache(cache))
        .catch((err) => console.warn("Failed to store in runtime cache:", pathname, err)),
    );
  }
  return response;
}
