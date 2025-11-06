const CACHE_NAME = 'offpay-v1';
const APP_SHELL = '/index.html';
const ASSETS_TO_CACHE = [
  '/',
  APP_SHELL,
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/favicon.png',
];

self.addEventListener('install', (event) => {
  console.log('[Service Worker] Install');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching app shell and assets');
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.error('[Service Worker] Failed to cache assets:', err);
        throw err;
      });
    })
  );
  self.skipWaiting();
});

async function ensureAppShellCached() {
  const cache = await caches.open(CACHE_NAME);
  const cachedShell = await cache.match(APP_SHELL);
  
  if (!cachedShell) {
    console.log('[Service Worker] App shell missing from cache, attempting to restore...');
    try {
      const response = await fetch(APP_SHELL);
      if (response.ok) {
        await cache.put(APP_SHELL, response);
        console.log('[Service Worker] App shell restored to cache');
      }
    } catch (err) {
      console.error('[Service Worker] Failed to restore app shell:', err);
    }
  }
}

self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activate');
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('[Service Worker] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      ensureAppShellCached()
    ])
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
              JSON.stringify({ error: 'Offline - cached data not available' }),
              {
                status: 503,
                headers: { 'Content-Type': 'application/json' },
              }
            );
          });
        })
    );
  } else {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        
        const fetchPromise = fetch(request)
          .then((response) => {
            if (response.ok && url.origin === location.origin) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseClone);
              });
              
              if (request.mode === 'navigate') {
                ensureAppShellCached().catch((err) => {
                  console.error('[Service Worker] Background shell check failed:', err);
                });
              }
            }
            return response;
          })
          .catch(() => {
            if (request.mode === 'navigate') {
              return caches.match(APP_SHELL).then((appShell) => {
                if (appShell) {
                  return appShell;
                }
                console.error('[Service Worker] App shell not in cache - user may be offline before first load');
                return new Response('App offline - please connect to internet and reload once', {
                  status: 503,
                  headers: { 'Content-Type': 'text/html' },
                });
              });
            }
            return new Response('Offline - resource not cached', {
              status: 503,
              headers: { 'Content-Type': 'text/plain' },
            });
          });
        
        return fetchPromise;
      })
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
