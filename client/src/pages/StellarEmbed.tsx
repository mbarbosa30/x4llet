import { useRoute } from 'wouter';

const STELLAR_WALLET_URL = import.meta.env.VITE_STELLAR_WALLET_URL || 'https://nanopaystellar.replit.app';

export default function StellarEmbed() {
  const [, params] = useRoute('/stellar/:path*');
  const path = params?.['path*'] || '';
  
  return (
    <iframe 
      src={`${STELLAR_WALLET_URL}/${path}`}
      className="fixed inset-0 w-full h-full border-0"
      allow="clipboard-write"
      title="nanoPay Stellar"
      data-testid="iframe-stellar"
    />
  );
}
