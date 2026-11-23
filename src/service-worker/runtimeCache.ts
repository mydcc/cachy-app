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
 * Deliberately not keyed by the build version, so an entry survives the deploy
 * that replaces the precache. That is only safe as long as an entry cannot go
 * stale: `_app/immutable/*` names carry a content hash, but `/ammo/*` does not.
 * Unhashed files are therefore revalidated in the background on every hit —
 * the current use gets the cached copy, the next one gets whatever the server
 * now has.
 */

/**
 * Bumped from "runtime-lazy" when the origin check arrived: entries written by
 * the earlier worker were never checked for their origin, and a renamed cache
 * is the one way to drop them all on activation (`deleteOldCaches` keeps only
 * the current precache and this name). Bump it again whenever what may be
 * stored here gets stricter.
 */
export const RUNTIME_CACHE = "runtime-lazy-v2";
export const MAX_RUNTIME_CACHE_ENTRIES = 50;

/** `_app/immutable/*` and `/ammo/*`, after any configured base path. */
const RUNTIME_SCOPE = /\/(_app\/immutable|ammo)\//;

export function isRuntimeCacheablePath(pathname: string): boolean {
  return RUNTIME_SCOPE.test(pathname);
}

/** Only Vite output is content-hashed; anything else can change under its name. */
export function isContentHashedPath(pathname: string): boolean {
  return /\/_app\/immutable\//.test(pathname);
}

/**
 * FIFO eviction in `cache.keys()` order, which is insertion order. Hashed
 * chunks are never re-inserted on a hit, so for them first-in is the oldest
 * first use; a revalidated unhashed file moves to the end, as a fresh write.
 */
export async function trimRuntimeCache(cache: Cache, max = MAX_RUNTIME_CACHE_ENTRIES): Promise<void> {
  const keys = await cache.keys();
  const excess = keys.length - max;
  for (const key of keys.slice(0, Math.max(0, excess))) {
    await cache.delete(key);
  }
}

/**
 * Only a same-origin response may live under a local pathname key. The fetch
 * handler already ignores foreign URLs; this keeps a redirect to another
 * origin (type "cors" or "opaque") from slipping in under the app's name.
 */
function isOwnOrigin(response: Response): boolean {
  return response.type !== "cors" && response.type !== "opaque" && response.type !== "opaqueredirect";
}

function store(cache: Cache, pathname: string, response: Response): Promise<void> {
  if (!isOwnOrigin(response)) return Promise.resolve();
  return cache
    .put(pathname, response)
    .then(() => trimRuntimeCache(cache))
    .catch((err) => console.warn("Failed to store in runtime cache:", pathname, err));
}

/**
 * Cache-first lookup for an in-scope file. A miss goes to the network and a
 * 200 is stored without delaying the response; `keepAlive` holds the service
 * worker open until the write and the trim are done. A hit on a file without a
 * content hash is refreshed the same way in the background. A network failure
 * on a miss is rethrown — the caller's import then rejects, and the page
 * decides how to report it.
 */
export async function respondFromRuntimeCache(
  pathname: string,
  request: Request,
  keepAlive: (work: Promise<unknown>) => void,
): Promise<Response> {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(pathname);
  if (cached) {
    if (!isContentHashedPath(pathname)) {
      keepAlive(
        fetch(request)
          .then((fresh) => (fresh instanceof Response && fresh.status === 200 ? store(cache, pathname, fresh) : undefined))
          // Offline or unreachable: the cached copy already answered.
          .catch((err) => console.warn("Runtime cache revalidation failed:", pathname, err)),
      );
    }
    return cached;
  }

  const response = await fetch(request);
  if (response instanceof Response && response.status === 200 && isOwnOrigin(response)) {
    keepAlive(store(cache, pathname, response.clone()));
  }
  return response;
}
