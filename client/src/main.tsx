import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// Service worker cleanup version - increment this to force a fresh install
const SW_CLEANUP_VERSION = 2;

if ('serviceWorker' in navigator) {
  const cleanupKey = 'sw_cleanup_version';
  const storedVersion = localStorage.getItem(cleanupKey);
  
  // Force unregister and clear caches if cleanup version changed
  if (storedVersion !== String(SW_CLEANUP_VERSION)) {
    console.log('[PWA] Cleanup version changed, unregistering old service workers...');
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        registration.unregister();
        console.log('[PWA] Unregistered:', registration.scope);
      });
    });
    caches.keys().then((cacheNames) => {
      cacheNames.forEach((cacheName) => {
        caches.delete(cacheName);
        console.log('[PWA] Deleted cache:', cacheName);
      });
    });
    localStorage.setItem(cleanupKey, String(SW_CLEANUP_VERSION));
    // Don't register new SW this load - let it be clean
    console.log('[PWA] Cleanup complete. Refresh to register new service worker.');
  } else {
    // Normal service worker registration
    let updatePromptShown = false;
    let refreshing = false;

    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/service-worker.js')
        .then((registration) => {
          console.log('[PWA] Service Worker registered:', registration.scope);

          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // Only show the prompt once per session
                  if (!updatePromptShown) {
                    updatePromptShown = true;
                    console.log('[PWA] New version available');
                    if (confirm('A new version is available. Reload to update?')) {
                      newWorker.postMessage({ type: 'SKIP_WAITING' });
                    }
                  }
                }
              });
            }
          });

          // Check for updates periodically (every 60 seconds)
          setInterval(() => {
            registration.update();
          }, 60000);
        })
        .catch((error) => {
          console.log('[PWA] Service Worker registration failed:', error);
        });
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }
}
