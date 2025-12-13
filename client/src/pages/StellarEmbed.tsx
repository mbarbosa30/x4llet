import { useRoute } from 'wouter';

export default function StellarEmbed() {
  const [, params] = useRoute('/stellar/:path*');
  const path = params?.['path*'] || '';
  
  return (
    <iframe 
      src={`https://nanopaystrellar.replit.app/${path}`}
      className="fixed inset-0 w-full h-full border-0"
      allow="clipboard-write"
      title="nanoPay Stellar"
      data-testid="iframe-stellar"
    />
  );
}
