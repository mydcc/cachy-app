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
import { version } from "$app/env";
import { assets, immutable } from "$app/manifest";
import { asset } from "$app/paths";
import { self } from "$app/service-worker";
import type { AssetPath } from "$app/types";

// Create a unique cache name for this deployment
const CACHE = `cache-${version}`;

// `$app/manifest` paths are relative to the base path ("_app/…", "robots.txt"),
// while `url.pathname` in the fetch handler is absolute ("/_app/…"). Comparing
// them raw makes every `ASSETS.includes(...)` below miss, which silently kills
// cache-first for immutable assets. `asset()` is the path-prefixing helper for
// files; the SvelteKit docs show `resolve()` here, but that one is typed for
// route IDs and rejects a union of asset paths outright.
//
// Typed as `string[]` on purpose: the helpers return narrow literal unions,
// which would make `includes(url.pathname)` a type error. The `immutable` cast
// is needed because Kit types those Vite output paths as plain `string` while
// `asset()` only accepts the `AssetPath` union of files in `static`.
// FEAT-0775: files that are never requested by the app itself — only by
// crawlers (`og:image`, `twitter:image`, schema.org) or by someone following an
// external link. They stay reachable over the network; removing them from the
// precache is not deleting them. Precaching them made every install download
// ~2.3 MiB that no offline view can show.
//
// `static/knowledge/` is not linked from `src/` at all, and its two file names
// contain spaces, which `url.pathname` reports percent-encoded — so they were
// cached under a key the fetch handler never looks up.
const NOT_PRECACHED = [
  "/og-image.jpg", // social preview, referenced from <meta> only
  "/twitter-image.jpg", // byte-identical to og-image.jpg
  "/seo-banner.png", // byte-identical to og-image.jpg
  "/knowledge/Tutorial_ RSI.pdf", // not linked from the app
  "/knowledge/setups/Dolphin Strategy PDF.pdf", // not linked from the app
];

const ASSETS: string[] = [
  ...immutable.map((entry) => asset(entry.path as AssetPath)), // the app itself
  ...assets.map((entry) => asset(entry.path)), // everything in `static`
].filter((path) => !NOT_PRECACHED.includes(path));

self.addEventListener("install", (event) => {
  // PA-07: cache assets one by one so a single failing request (flaky
  // connection, ~12 MB of static/) does not abort the whole install/update.
  // Teilerfolge bleiben im Cache; fehlende Eintraege werden beim naechsten
  // Fetch nachgezogen (siehe respond() unten). PA-08: die App-Shell ("/")
  // wird mitgecached, damit ein Reload/Kaltstart ohne Netz die App startet.
  async function addFilesToCache() {
    let cache: Cache;
    try {
      cache = await caches.open(CACHE);
    } catch (err) {
      console.error("Failed to open cache:", err);
      return;
    }
    const toCache = [...ASSETS, "/"];
    const results = await Promise.allSettled(
      toCache.map(async (path) => {
        try {
          const response = await fetch(path);
          if (!(response instanceof Response)) {
            throw new Error("fetch returned non-Response");
          }
          if (response.status !== 200) {
            throw new Error(`bad status ${response.status}`);
          }
          await cache.put(path, response);
        } catch (err) {
          // PA-07: log, but do not fail the install. allSettled records the rejection.
          console.warn("Failed to cache asset:", path, err);
        }
      }),
    );
    // Keep the partial successes; nothing else to do.
    void results;
  }

  (event as ExtendableEvent).waitUntil(addFilesToCache());
});

self.addEventListener("activate", (event) => {
  // Remove previous caches
  async function deleteOldCaches() {
    for (const key of await caches.keys()) {
      if (key !== CACHE) {
        try {
          await caches.delete(key);
        } catch (err) {
          console.warn("Failed to delete old cache:", key, err);
        }
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
    let cache: Cache;
    try {
      cache = await caches.open(CACHE);
    } catch (err) {
      console.error("Failed to open cache:", fetchEvent.request.url, err);
      throw err;
    }

    // Serve build assets from the cache
    if (ASSETS.includes(url.pathname)) {
      const response = await cache.match(url.pathname);
      if (response) return response;
    }

    // PA-08: App-Shell fallback for navigations. A reload/kaltstart without
    // network serves the cached "/" so Journal/Settings/Presets (lokal) noch
    // starten, statt der Browser-Offline-Seite.
    if (fetchEvent.request.mode === "navigate") {
      const cachedShell = await cache.match("/");
      if (cachedShell) {
        // Network-first: try the network, fall back to the shell.
        try {
          const response = await fetch(fetchEvent.request);
          if (response instanceof Response && response.ok) return response;
          if (!(response instanceof Response)) {
            console.warn("Navigation fetch returned non-Response, serving cached shell:", fetchEvent.request.url, response);
          }
        } catch (err) {
          console.warn("Navigation fetch failed, serving cached shell:", fetchEvent.request.url, err);
        }
        return cachedShell;
      }
    }

    try {
      const response = await fetch(fetchEvent.request);

      // if we're offline, fetch can return a value that is not a Response
      // instead of throwing - and we can't consume it in this case
      if (!(response instanceof Response)) {
        throw new Error("invalid response from fetch");
      }

      const isCacheable =
        response.status === 200 && (ASSETS.includes(url.pathname) || url.pathname === "/");

      if (isCacheable) {
        cache.put(fetchEvent.request, response.clone()).catch((err) => {
          console.warn("Failed to cache response:", fetchEvent.request.url, err);
        });
      }

      return response;
    } catch (err) {
      console.warn("Fetch failed, trying cache:", fetchEvent.request.url, err);
      let cached: Response | undefined;
      try {
        cached = await cache.match(fetchEvent.request);
      } catch (matchErr) {
        console.warn("Cache match failed:", fetchEvent.request.url, matchErr);
      }
      if (cached) {
        return cached;
      }

      // if there's no cache, then just error out
      // as there is nothing we can do to respond to this request
      throw err;
    }
  }

  fetchEvent.respondWith(
    respond().catch((err) => {
      console.error("Service worker respond() failed:", fetchEvent.request.url, err);
      throw err;
    }),
  );
});
