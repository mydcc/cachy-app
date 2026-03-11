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

/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />
import { build, files, version } from "$service-worker";

declare const self: ServiceWorkerGlobalScope;

// Create a unique cache name for this deployment
const CACHE = `cache-${version}`;
const RUNTIME_CACHE = `runtime-${version}`;
const MAX_RUNTIME_CACHE_ENTRIES = 50; // Limit runtime cache size

const ASSETS = [
  ...build, // the app itself
  ...files, // everything in `static`
];

self.addEventListener("install", (event) => {
  // Create a new cache and add all files to it
  async function addFilesToCache() {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS);
  }

  (event as ExtendableEvent).waitUntil(addFilesToCache());
});

self.addEventListener("activate", (event) => {
  // Remove previous caches
  async function deleteOldCaches() {
    for (const key of await caches.keys()) {
      if (key !== CACHE && key !== RUNTIME_CACHE) {
        await caches.delete(key);
      }
    }
  }

  (event as ExtendableEvent).waitUntil(deleteOldCaches());
});

self.addEventListener("fetch", (event) => {
  const fetchEvent = event as FetchEvent;

  // ignore POST requests etc
  if (fetchEvent.request.method !== "GET") return;

  // Ignore non-http/https requests (e.g. chrome-extension://)
  if (!fetchEvent.request.url.startsWith("http")) return;

  const url = new URL(fetchEvent.request.url);

  // Ignore API requests (let them go to the network directly)
  if (url.pathname.startsWith("/api/")) return;

  async function respond() {
    const cache = await caches.open(CACHE);

    // Serve build assets from the cache
    if (ASSETS.includes(url.pathname)) {
      const response = await cache.match(url.pathname);
      if (response) return response;
    }

    try {
      const response = await fetch(fetchEvent.request);

      // if we're offline, fetch can return a value that is not a Response
      // instead of throwing - and we can't consume it in this case
      if (!(response instanceof Response)) {
        throw new Error("invalid response from fetch");
      }

      // CRITICAL FIX: Only cache static assets, NOT dynamic content
      // This prevents Service Worker memory explosion from caching klines, news, API responses
      const isCacheable =
        response.status === 200 &&
        ASSETS.includes(url.pathname) && // ONLY cache known static assets
        !url.pathname.startsWith("/api/");

      if (isCacheable) {
        cache.put(fetchEvent.request, response.clone()).catch((err) => {
          console.warn("Failed to cache response:", err);
        });
      }

      return response;
    } catch (err) {
      const response = await cache.match(fetchEvent.request);

      if (response) {
        return response;
      }

      // if there's no cache, then just error out
      // as there is nothing we can do to respond to this request
      throw err;
    }
  }

  fetchEvent.respondWith(respond());
});
