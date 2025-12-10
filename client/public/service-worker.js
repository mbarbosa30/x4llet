const CACHE_PREFIX = 'nanopay-';
let CACHE_NAME = `${CACHE_PREFIX}initial`;
const APP_SHELL = '/index.html';
const STATIC_ASSETS = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/favicon.png',
];

async function getServerVersion() {
  try {
    const response = await fetch('/api/version');
    if (response.ok) {
      const data = await response.json();
      return data.version || 'unknown';
    }
  } catch (e) {
    console.log('[Service Worker] Could not fetch version');
  }
  return null;
}

async function updateCacheVersion() {
  const version = await getServerVersion();
  if (version) {
    CACHE_NAME = `${CACHE_PREFIX}${version}`;
    console.log('[Service Worker] Cache version:', CACHE_NAME);
  }
}

self.addEventListener('install', (event) => {
  console.log('[Service Worker] Install');
  event.waitUntil(
    (async () => {
      await updateCacheVersion();
      const cache = await caches.open(CACHE_NAME);
      console.log('[Service Worker] Caching static assets');
      await cache.addAll(STATIC_ASSETS).catch((err) => {
        console.error('[Service Worker] Failed to cache assets:', err);
      });
    })()
  );
  // Do NOT call self.skipWaiting() here - let the client control when to activate
  // This prevents the infinite update loop where install -> skipWaiting -> controllerchange -> reload -> install
});

self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activate');
  event.waitUntil(
    (async () => {
      await updateCacheVersion();
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })()
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') {
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            return new Response(
              JSON.stringify({ error: 'Offline - please check your connection' }),
              {
                status: 503,
                headers: { 'Content-Type': 'application/json' },
              }
            );
          });
        })
    );
    return;
  }

  const isAsset = url.pathname.match(/\.(js|css|woff2?|ttf|eot)$/) || 
                  url.pathname.startsWith('/assets/');
  
  if (isAsset) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            return new Response('Asset not available offline', {
              status: 503,
              headers: { 'Content-Type': 'text/plain' },
            });
          });
        })
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(APP_SHELL, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(APP_SHELL).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            return new Response('Please connect to the internet and reload', {
              status: 503,
              headers: { 'Content-Type': 'text/html' },
            });
          });
        })
    );
    return;
  }

  const isStaticAsset = STATIC_ASSETS.some(asset => url.pathname === asset);
  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request);
      })
    );
    return;
  }

  event.respondWith(fetch(request));
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
