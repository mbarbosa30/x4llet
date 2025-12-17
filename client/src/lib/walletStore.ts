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

let idleTimeout: ReturnType<typeof setTimeout> | null = null;
let autoLockMinutes = 0; // Default: no auto-lock (only lock on tab close)

function notifyListeners() {
  listeners.forEach(listener => listener());
}

/**
 * Session Persistence Security Model:
 * 
 * The DEK is stored in sessionStorage to survive page refreshes.
 * This is a UX/security trade-off:
 * - sessionStorage is cleared when the tab closes
 * - Idle timeout clears the session after inactivity
 * - Primary security relies on device lock screen
 * - XSS attacks could access sessionStorage (accepted risk for UX)
 * 
 * Defense-in-depth: CSP headers, dependency audits, idle timeouts
 */

function persistSession(dek: Uint8Array): void {
  try {
    // If autoLockMinutes is -1, user wants password on every refresh
    // Don't persist to sessionStorage in this case
    if (autoLockMinutes === -1) {
      console.log('[WalletStore] Session persistence disabled (password required on every refresh)');
      clearSession();
      return;
    }
    
    // Store DEK as base64 in sessionStorage
    const dekBase64 = btoa(String.fromCharCode(...dek));
    sessionStorage.setItem(SESSION_KEY, dekBase64);
    console.log('[WalletStore] Session persisted to sessionStorage');
    
    // Set expiry based on autoLockMinutes
    if (autoLockMinutes > 0) {
      const expiry = Date.now() + (autoLockMinutes * 60 * 1000);
      sessionStorage.setItem(SESSION_EXPIRY_KEY, expiry.toString());
    } else {
      // autoLockMinutes === 0 means persist until tab closes (no expiry)
      sessionStorage.removeItem(SESSION_EXPIRY_KEY);
    }
  } catch (error) {
    console.error('[WalletStore] Failed to persist session:', error);
  }
}

function restoreSession(): Uint8Array | null {
  try {
    const dekBase64 = sessionStorage.getItem(SESSION_KEY);
    if (!dekBase64) {
      console.log('[WalletStore] No session found in sessionStorage');
      return null;
    }
    
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
    
    // Restore DEK from base64
    const dek = Uint8Array.from(atob(dekBase64), c => c.charCodeAt(0));
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

  setDek: (dek: Uint8Array) => {
    state = { dek, isUnlocked: true };
    persistSession(dek);
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
    console.log('[WalletStore] setAutoLockMinutes called with:', minutes, typeof minutes);
    autoLockMinutes = minutes;
    
    // If switching to "every refresh" mode, clear session and stop idle timer
    if (minutes === -1) {
      clearSession();
      // Clear any pending idle timeout - we don't want auto-lock when persistence is disabled
      if (idleTimeout) {
        clearTimeout(idleTimeout);
        idleTimeout = null;
      }
      console.log('[WalletStore] Session persistence disabled, cleared session and idle timer');
    } else if (state.dek) {
      // Re-persist with new expiry settings and reset idle timer
      persistSession(state.dek);
      resetIdleTimeout();
    } else {
      // Just reset idle timeout for new settings (even if not currently unlocked)
      resetIdleTimeout();
    }
  },
  
  getAutoLockMinutes: (): number => autoLockMinutes,
  
  tryRestoreSession: (): boolean => {
    const dek = restoreSession();
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
