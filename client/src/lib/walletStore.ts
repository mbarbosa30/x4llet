import { useState, useEffect, useSyncExternalStore } from 'react';

type WalletStoreListener = () => void;

interface WalletStoreState {
  dek: Uint8Array | null;
  isUnlocked: boolean;
}

const listeners = new Set<WalletStoreListener>();

let state: WalletStoreState = {
  dek: null,
  isUnlocked: false,
};

function notifyListeners() {
  listeners.forEach(listener => listener());
}

export const walletStore = {
  getState: (): WalletStoreState => state,

  setDek: (dek: Uint8Array) => {
    state = { dek, isUnlocked: true };
    notifyListeners();
  },

  clearDek: () => {
    state = { dek: null, isUnlocked: false };
    notifyListeners();
  },

  getDek: (): Uint8Array | null => state.dek,

  isUnlocked: (): boolean => state.isUnlocked,

  subscribe: (listener: WalletStoreListener): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
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
