import { useSyncExternalStore } from 'react';

type WalletStoreListener = () => void;

interface WalletStoreState {
  dek: Uint8Array | null;
  isUnlocked: boolean;
}

const SESSION_KEY = 'wallet_session';
const SESSION_EXPIRY_KEY = 'wallet_session_expiry';
const listeners = new Set<WalletStoreListener>();

let state: WalletStoreState = {
  dek: null,
  isUnlocked: false,
};

let sessionKey: Uint8Array | null = null;
let idleTimeout: ReturnType<typeof setTimeout> | null = null;
let autoLockMinutes = 15; // Default 15 minutes

function notifyListeners() {
  listeners.forEach(listener => listener());
}

async function generateSessionKey(): Promise<Uint8Array> {
  return crypto.getRandomValues(new Uint8Array(32));
}

async function encryptWithSessionKey(dek: Uint8Array, key: Uint8Array): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    dek
  );
  
  const result = new Uint8Array(iv.length + encrypted.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(encrypted), iv.length);
  
  return btoa(String.fromCharCode(...result));
}

async function decryptWithSessionKey(encryptedData: string, key: Uint8Array): Promise<Uint8Array> {
  const data = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
  const iv = data.slice(0, 12);
  const encrypted = data.slice(12);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    encrypted
  );
  
  return new Uint8Array(decrypted);
}

async function persistSession(dek: Uint8Array): Promise<void> {
  try {
    if (!sessionKey) {
      sessionKey = await generateSessionKey();
    }
    
    const encryptedDek = await encryptWithSessionKey(dek, sessionKey);
    
    // Store encrypted DEK and session key in sessionStorage
    const sessionData = {
      encryptedDek,
      sessionKey: btoa(String.fromCharCode(...sessionKey)),
    };
    
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
    
    // Set expiry based on autoLockMinutes
    if (autoLockMinutes > 0) {
      const expiry = Date.now() + (autoLockMinutes * 60 * 1000);
      sessionStorage.setItem(SESSION_EXPIRY_KEY, expiry.toString());
    } else {
      sessionStorage.removeItem(SESSION_EXPIRY_KEY);
    }
  } catch (error) {
    console.error('[WalletStore] Failed to persist session:', error);
  }
}

async function restoreSession(): Promise<Uint8Array | null> {
  try {
    const sessionDataStr = sessionStorage.getItem(SESSION_KEY);
    if (!sessionDataStr) return null;
    
    // Check expiry
    const expiryStr = sessionStorage.getItem(SESSION_EXPIRY_KEY);
    if (expiryStr) {
      const expiry = parseInt(expiryStr, 10);
      if (Date.now() > expiry) {
        console.log('[WalletStore] Session expired');
        clearSession();
        return null;
      }
    }
    
    const sessionData = JSON.parse(sessionDataStr);
    const storedSessionKey = Uint8Array.from(atob(sessionData.sessionKey), c => c.charCodeAt(0));
    
    const dek = await decryptWithSessionKey(sessionData.encryptedDek, storedSessionKey);
    sessionKey = storedSessionKey;
    
    console.log('[WalletStore] Session restored successfully');
    return dek;
  } catch (error) {
    console.error('[WalletStore] Failed to restore session:', error);
    clearSession();
    return null;
  }
}

function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_EXPIRY_KEY);
  sessionKey = null;
}

function resetIdleTimeout(): void {
  if (idleTimeout) {
    clearTimeout(idleTimeout);
    idleTimeout = null;
  }
  
  if (autoLockMinutes > 0 && state.isUnlocked) {
    idleTimeout = setTimeout(() => {
      console.log('[WalletStore] Auto-locking due to inactivity');
      walletStore.clearDek();
    }, autoLockMinutes * 60 * 1000);
  }
}

// Listen for user activity to reset idle timer
if (typeof window !== 'undefined') {
  const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll'];
  activityEvents.forEach(event => {
    window.addEventListener(event, () => {
      if (state.isUnlocked) {
        resetIdleTimeout();
        // Update expiry in sessionStorage
        if (autoLockMinutes > 0) {
          const expiry = Date.now() + (autoLockMinutes * 60 * 1000);
          sessionStorage.setItem(SESSION_EXPIRY_KEY, expiry.toString());
        }
      }
    }, { passive: true });
  });
}

export const walletStore = {
  getState: (): WalletStoreState => state,

  setDek: async (dek: Uint8Array) => {
    state = { dek, isUnlocked: true };
    await persistSession(dek);
    resetIdleTimeout();
    notifyListeners();
  },

  clearDek: () => {
    state = { dek: null, isUnlocked: false };
    clearSession();
    if (idleTimeout) {
      clearTimeout(idleTimeout);
      idleTimeout = null;
    }
    notifyListeners();
  },

  getDek: (): Uint8Array | null => state.dek,

  isUnlocked: (): boolean => state.isUnlocked,

  subscribe: (listener: WalletStoreListener): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  
  setAutoLockMinutes: (minutes: number) => {
    autoLockMinutes = minutes;
    resetIdleTimeout();
  },
  
  getAutoLockMinutes: (): number => autoLockMinutes,
  
  tryRestoreSession: async (): Promise<boolean> => {
    const dek = await restoreSession();
    if (dek) {
      state = { dek, isUnlocked: true };
      resetIdleTimeout();
      notifyListeners();
      return true;
    }
    return false;
  },
};

export function useWalletStore() {
  const currentState = useSyncExternalStore(
    walletStore.subscribe,
    walletStore.getState,
    walletStore.getState
  );

  return {
    dek: currentState.dek,
    isUnlocked: currentState.isUnlocked,
    setDek: walletStore.setDek,
    clearDek: walletStore.clearDek,
  };
}
