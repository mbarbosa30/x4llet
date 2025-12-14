import { useEffect, useRef } from 'react';
import { useRoute } from 'wouter';

const STELLAR_WALLET_URL = import.meta.env.VITE_STELLAR_WALLET_URL || 'https://nanopaystellar.replit.app';
const WALLET_SESSION_PREFIX = 'nanopay_bridge_';

// Allowed key prefixes for multi-wallet session bridge
// Each wallet uses: ${walletType}_session with combined {dek, expiry} payload
// Examples: stellar_session, evm_session, solana_session
const ALLOWED_KEY_PREFIXES = ['stellar_', 'evm_', 'solana_', 'wallet_'];

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
      
      // Security: only allow specific key prefixes for multi-wallet support
      const hasValidPrefix = ALLOWED_KEY_PREFIXES.some(prefix => key.startsWith(prefix));
      if (!hasValidPrefix) {
        console.warn('[WalletBridge] Rejected key with invalid prefix:', key);
        return;
      }
      
      const storageKey = `${WALLET_SESSION_PREFIX}${key}`;
      
      switch (type) {
        case 'storeSession':
          // Store session payload from iframe (typically {dek, expiry} object)
          if (value !== undefined) {
            try {
              sessionStorage.setItem(storageKey, JSON.stringify(value));
              console.log('[WalletBridge] Stored session for key:', key);
            } catch (err) {
              console.error('[WalletBridge] Failed to store session:', err);
            }
          }
          break;
          
        case 'requestSession':
          // Return stored session payload to iframe
          // Iframe is responsible for validating expiry before using DEK
          try {
            const stored = sessionStorage.getItem(storageKey);
            const parsedValue = stored ? JSON.parse(stored) : null;
            
            iframeRef.current?.contentWindow?.postMessage({
              type: 'sessionData',
              key,
              value: parsedValue,
            }, stellarOrigin);
            
            console.log('[WalletBridge] Sent session for key:', key, parsedValue ? '(found)' : '(empty)');
          } catch (err) {
            console.error('[WalletBridge] Failed to retrieve session:', err);
          }
          break;
          
        case 'clearSession':
          // Clear session data (on logout/lock)
          try {
            sessionStorage.removeItem(storageKey);
            console.log('[WalletBridge] Cleared session for key:', key);
          } catch (err) {
            console.error('[WalletBridge] Failed to clear session:', err);
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
