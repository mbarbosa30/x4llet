import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { getWallet, getPreferences } from '@/lib/wallet';

interface WalletState {
  address: string | null;
  isLoading: boolean;
  currency: string;
  earnMode: boolean;
}

interface UseWalletOptions {
  redirectOnMissing?: boolean;
  loadPreferences?: boolean;
}

export function useWallet(options?: UseWalletOptions) {
  const { redirectOnMissing = true, loadPreferences = false } = options ?? {};
  const [, setLocation] = useLocation();
  const [state, setState] = useState<WalletState>({
    address: null,
    isLoading: true,
    currency: 'USD',
    earnMode: false,
  });

  useEffect(() => {
    const loadWallet = async () => {
      try {
        const wallet = await getWallet();
        if (!wallet) {
          if (redirectOnMissing) {
            setLocation('/');
          }
          setState(prev => ({ ...prev, isLoading: false }));
          return;
        }

        let currency = 'USD';
        let earnMode = false;
        
        if (loadPreferences) {
          const prefs = await getPreferences();
          currency = prefs.currency;
          earnMode = prefs.earnMode || false;
        }

        setState({
          address: wallet.address,
          isLoading: false,
          currency,
          earnMode,
        });
      } catch (error: any) {
        if (redirectOnMissing) {
          if (error.message === 'RECOVERY_CODE_REQUIRED') {
            setLocation('/unlock');
          } else {
            setLocation('/');
          }
        }
        setState(prev => ({ ...prev, isLoading: false }));
      }
    };
    loadWallet();
  }, [setLocation, redirectOnMissing, loadPreferences]);

  return state;
}
