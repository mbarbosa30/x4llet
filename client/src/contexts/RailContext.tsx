import { createContext, useContext, useState, type ReactNode } from 'react';
import type { PaymentRail } from '@/lib/rails';
import { PublicRail, PrivateRail } from '@/lib/rails';

interface RailContextValue {
  activeRail: PaymentRail;
  privacyMode: boolean;
  setPrivacyMode: (enabled: boolean) => void;
  publicRail: PublicRail;
  privateRail: PrivateRail;
  getRailForPayment: (chainId: number, token: string) => Promise<PaymentRail>;
}

const RailContext = createContext<RailContextValue | null>(null);

export function RailProvider({ children }: { children: ReactNode }) {
  // Privacy mode is disabled by default and not persisted until feature is stable
  const [privacyMode, setPrivacyModeState] = useState(false);
  const [publicRail] = useState(() => new PublicRail());
  const [privateRail] = useState(() => new PrivateRail());

  // IMPORTANT: Do not persist privacy mode preference until PrivateRail is functional
  // This prevents users from getting stuck with a non-functional rail
  const setPrivacyMode = (enabled: boolean) => {
    if (enabled) {
      console.warn('Privacy mode is experimental and not yet functional');
    }
    setPrivacyModeState(enabled);
  };

  // Helper function to get the appropriate rail for a payment
  // This implements automatic fallback: try private first if enabled, else use public
  const getRailForPayment = async (chainId: number, token: string): Promise<PaymentRail> => {
    if (privacyMode) {
      const canUsePrivate = await privateRail.canPay(chainId, token);
      if (canUsePrivate) {
        return privateRail;
      }
      // Auto-fallback to public if private can't handle this payment
      console.info('Private rail unavailable, falling back to public rail');
    }
    return publicRail;
  };

  // activeRail is always PublicRail until PrivateRail is functional
  // This prevents breaking existing functionality
  const activeRail = publicRail;

  return (
    <RailContext.Provider value={{ 
      activeRail, 
      privacyMode, 
      setPrivacyMode, 
      publicRail, 
      privateRail,
      getRailForPayment
    }}>
      {children}
    </RailContext.Provider>
  );
}

export function useRail() {
  const context = useContext(RailContext);
  if (!context) {
    throw new Error('useRail must be used within RailProvider');
  }
  return context;
}
