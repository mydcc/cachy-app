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
            console.error('PWA Install: Failed to cache assets. This prevents WebAPK generation.', error);
            // Fallback: Try caching critical assets only if full bulk fails
            // This is crucial because if one file (like a large image) fails,
            // the whole SW fails, and the app becomes just a Shortcut (white splash).
             const criticalAssets = ASSETS.filter(file =>
                file.endsWith('.html') ||
                file.endsWith('.js') ||
                file.endsWith('.css') ||
                file.endsWith('.json') ||
                file.endsWith('.webmanifest') ||
                file.includes('icon')
            );

            // Try forcing critical assets
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
    // Force the waiting service worker to become the active service worker.
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
    // Claim any clients immediately, so that the page will be controlled by the service worker immediately.
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // ignore POST requests etc
    if (event.request.method !== 'GET') return;

    // Ignore chrome-extension schemes etc
    const url = new URL(event.request.url);
    if (!url.protocol.startsWith('http')) return;

    async function respond() {
        const cache = await caches.open(CACHE);

        // Serve build assets from the cache
        if (ASSETS.includes(url.pathname)) {
            const response = await cache.match(url.pathname);
            if (response) return response;
        }

        try {
            const response = await fetch(event.request);

            // if we're offline, fetch can return a value that is not a Response
            // instead of throwing - and we can't consume it in this case
            if (!(response instanceof Response)) {
                throw new Error('invalid response from fetch');
            }

            if (response.status === 200) {
                cache.put(event.request, response.clone());
            }

            return response;
        } catch (err) {
            const response = await cache.match(event.request);

            if (response) {
                return response;
            }

            // if there's no cache, then just error out
            throw err;
        }
    }

    event.respondWith(respond());
});
