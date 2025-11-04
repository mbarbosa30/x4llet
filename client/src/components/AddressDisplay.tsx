import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Copy, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface AddressDisplayProps {
  address: string;
  truncate?: boolean;
}

export default function AddressDisplay({ address, truncate = true }: AddressDisplayProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const displayAddress = truncate 
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : address;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      toast({
        title: "Copied!",
        description: "Address copied to clipboard",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <code className="font-mono text-sm bg-muted px-3 py-2 rounded-md flex-1 text-center" data-testid="text-address">
        {displayAddress}
      </code>
      <Button 
        variant="outline" 
        size="icon"
        onClick={handleCopy}
        data-testid="button-copy-address"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}
