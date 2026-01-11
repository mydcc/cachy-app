/// <reference types="@sveltejs/kit" />
import { build, files, version } from '$service-worker';

// Create a unique cache name for this deployment
const CACHE = `cache-${version}`;

const ASSETS = [
    ...build, // the app itself
    ...files  // everything in `static`
];

self.addEventListener('install', (event) => {
    // Create a new cache and add all files to it
    async function addFilesToCache() {
        const cache = await caches.open(CACHE);
        try {
            await cache.addAll(ASSETS);
        } catch (error) {
            console.error('PWA Install: Failed to cache assets.', error);
            // Fallback: Try caching critical assets only
             const criticalAssets = ASSETS.filter(file =>
                file.endsWith('.html') ||
                file.endsWith('.js') ||
                file.endsWith('.css') ||
                file.endsWith('.json') ||
                file.endsWith('.webmanifest') ||
                file.includes('icon')
            );

            for (const asset of criticalAssets) {
                try {
                    await cache.add(asset);
                } catch (e) {
                    console.warn(`Failed to cache critical asset: ${asset}`, e);
                }
            }
        }
    }

    event.waitUntil(addFilesToCache());
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    // Remove previous caches
    async function deleteOldCaches() {
        for (const key of await caches.keys()) {
            if (key !== CACHE) await caches.delete(key);
        }
    }

    event.waitUntil(deleteOldCaches());
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // GET requests only
    if (event.request.method !== 'GET') return;

    async function respond() {
        const url = new URL(event.request.url);
        const cache = await caches.open(CACHE);

        // Assets cache
        if (ASSETS.includes(url.pathname)) {
            const response = await cache.match(url.pathname);
            if (response) return response;
        }

        // Network fallthrough
        try {
            const response = await fetch(event.request);
            if (!(response instanceof Response)) {
                 throw new Error('invalid response from fetch');
            }
            return response;
        } catch (err) {
            const response = await cache.match(event.request);
            if (response) return response;
            throw err;
        }
    }

    event.respondWith(respond());
});
