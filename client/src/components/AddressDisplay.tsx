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
        title: "Address copied",
        description: `${address.slice(0, 6)}...${address.slice(-4)} copied to clipboard`,
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="flex h-10 items-center justify-center bg-muted border border-foreground/10 p-1 gap-1">
      <code className="font-mono text-sm px-3 flex-1 text-center text-muted-foreground" data-testid="text-address">
        {displayAddress}
      </code>
      <Button 
        variant="ghost" 
        size="sm"
        className="h-8 w-8 p-0"
        onClick={handleCopy}
        data-testid="button-copy-address"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}
