import { useEffect, useRef } from 'react';
import { useRoute } from 'wouter';

const STELLAR_WALLET_URL = import.meta.env.VITE_STELLAR_WALLET_URL || 'https://nanopaystellar.replit.app';
const STELLAR_SESSION_PREFIX = 'stellar_session_';

export default function StellarEmbed() {
  const [, params] = useRoute('/stellar/:path*');
  const path = params?.['path*'] || '';
  const iframeRef = useRef<HTMLIFrameElement>(null);
  
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Validate origin - only accept messages from Stellar wallet
      const stellarOrigin = new URL(STELLAR_WALLET_URL).origin;
      if (event.origin !== stellarOrigin) {
        return;
      }
      
      const { type, key, value } = event.data || {};
      
      if (!type || !key) return;
      
      // Security: only allow specific key prefixes
      if (!key.startsWith('stellar_')) {
        console.warn('[StellarBridge] Rejected key with invalid prefix:', key);
        return;
      }
      
      const storageKey = `${STELLAR_SESSION_PREFIX}${key}`;
      
      switch (type) {
        case 'storeSession':
          // Store session data from iframe
          if (value !== undefined) {
            try {
              sessionStorage.setItem(storageKey, JSON.stringify(value));
              console.log('[StellarBridge] Stored session for key:', key);
            } catch (err) {
              console.error('[StellarBridge] Failed to store session:', err);
            }
          }
          break;
          
        case 'requestSession':
          // Return stored session data to iframe
          try {
            const stored = sessionStorage.getItem(storageKey);
            const parsedValue = stored ? JSON.parse(stored) : null;
            
            iframeRef.current?.contentWindow?.postMessage({
              type: 'sessionData',
              key,
              value: parsedValue,
            }, stellarOrigin);
            
            console.log('[StellarBridge] Sent session for key:', key, parsedValue ? '(found)' : '(empty)');
          } catch (err) {
            console.error('[StellarBridge] Failed to retrieve session:', err);
          }
          break;
          
        case 'clearSession':
          // Clear specific session data
          try {
            sessionStorage.removeItem(storageKey);
            console.log('[StellarBridge] Cleared session for key:', key);
          } catch (err) {
            console.error('[StellarBridge] Failed to clear session:', err);
          }
          break;
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);
  
  return (
    <iframe 
      ref={iframeRef}
      src={`${STELLAR_WALLET_URL}/${path}`}
      className="fixed inset-0 w-full h-full border-0"
      allow="clipboard-write"
      title="nanoPay Stellar"
      data-testid="iframe-stellar"
    />
  );
}
