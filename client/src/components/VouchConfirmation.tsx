import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Shield, AlertCircle } from 'lucide-react';

interface VouchConfirmationProps {
  referrerAddress: string;
  onConfirm: () => Promise<void>;
  onDismiss: () => void;
  open: boolean;
}

export default function VouchConfirmation({
  referrerAddress,
  onConfirm,
  onDismiss,
  open,
}: VouchConfirmationProps) {
  const [isVouching, setIsVouching] = useState(false);

  const handleConfirm = async () => {
    setIsVouching(true);
    try {
      await onConfirm();
    } finally {
      setIsVouching(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onDismiss()}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <Shield className="h-5 w-5 text-primary" />
            <DialogTitle>Vouch Request</DialogTitle>
          </div>
          <DialogDescription>
            Someone has shared their referral link with you
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="bg-muted p-3 space-y-2">
            <div className="text-xs text-muted-foreground">Referrer Address</div>
            <div className="font-mono text-xs break-all">
              {referrerAddress}
            </div>
          </div>

          <div className="flex items-start gap-2 text-sm">
            <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <p className="text-muted-foreground text-xs leading-relaxed">
              Vouching means you're endorsing this person in the trust network. Your MaxFlow signal
              helps them build their network strength. Only vouch for people you trust.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={onDismiss}
            disabled={isVouching}
            data-testid="button-dismiss-vouch"
          >
            Not Now
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isVouching}
            data-testid="button-confirm-vouch"
          >
            {isVouching ? 'Vouching...' : 'Vouch for Them'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
