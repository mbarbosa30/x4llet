import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

if ('serviceWorker' in navigator) {
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
                    // The controllerchange event will handle the reload
                  }
                }
              }
            });
          }
        });

        // Check for updates periodically (every 60 seconds) instead of on every load
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
