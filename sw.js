// ─── KANSAS VANITY PLATE GENERATOR — SERVICE WORKER ─────────────────────────
// v1.0 — Caches all app assets for offline use and fast repeat loads

const CACHE_NAME = 'ks-vanity-v1';

// Everything we need to shell-cache so the app works offline
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  // Babel + React from CDN — we cache these on first fetch
];

// CDN resources we want to cache when first encountered
const CDN_CACHE_NAME = 'ks-vanity-cdn-v1';

// ── INSTALL: pre-cache the app shell ─────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Caching app shell');
      // Use individual adds so one failure doesn't kill the whole install
      return Promise.allSettled(
        SHELL_ASSETS.map(url => cache.add(url).catch(e => console.warn('[SW] Failed to cache:', url, e)))
      );
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: clean up old caches ────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== CDN_CACHE_NAME)
          .map(k => {
            console.log('[SW] Deleting old cache:', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: serve from cache, fall back to network ────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Don't intercept non-GET requests
  if (event.request.method !== 'GET') return;

  // CDN resources (unpkg, cdnjs, babel, etc.) — cache-first with network fallback
  const isCDN = url.hostname.includes('unpkg.com') ||
                url.hostname.includes('cdnjs.cloudflare.com') ||
                url.hostname.includes('cdn.jsdelivr.net');

  if (isCDN) {
    event.respondWith(
      caches.open(CDN_CACHE_NAME).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          });
        })
      )
    );
    return;
  }

  // App shell — cache-first, always works offline after first load
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache successful responses from our own origin
        if (response.ok && url.origin === self.location.origin) {
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
        }
        return response;
      }).catch(() => {
        // Offline fallback — return index.html for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// ── MESSAGE: allow the app to trigger cache updates ──────────────────────────
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
