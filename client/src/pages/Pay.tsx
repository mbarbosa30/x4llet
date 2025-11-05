import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, XCircle, ArrowRight } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import type { AuthorizationQR, TransferResponse } from '@shared/schema';

export default function Pay() {
  const [, setLocation] = useLocation();
  const [authorization, setAuthorization] = useState<AuthorizationQR | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoExecute, setAutoExecute] = useState(true);

  // Extract authorization from URL
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const authData = params.get('auth');
      
      if (!authData) {
        setError('No payment authorization found in URL');
        return;
      }

      // Decode base64 and parse JSON (URLSearchParams already URL-decodes)
      const decoded = atob(authData);
      const parsed = JSON.parse(decoded) as AuthorizationQR;
      
      setAuthorization(parsed);
    } catch (err) {
      console.error('Failed to parse authorization:', err);
      setError('Invalid payment link. Please check the URL and try again.');
    }
  }, []);

  const executeMutation = useMutation({
    mutationFn: async () => {
      if (!authorization) {
        throw new Error('No authorization data');
      }

      const res = await apiRequest('POST', '/api/relay/submit-authorization', {
        authorization,
      });
      return res.json() as Promise<TransferResponse>;
    },
    onSuccess: () => {
      // Success handled in UI
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to execute payment');
    },
  });

  // Auto-execute payment on load
  useEffect(() => {
    if (authorization && autoExecute && !executeMutation.isPending && !executeMutation.isSuccess && !executeMutation.isError) {
      executeMutation.mutate();
    }
  }, [authorization, autoExecute]);

  const formatAmount = (value: string) => {
    const amount = parseInt(value) / 1000000;
    return amount.toFixed(2);
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-3">
              <XCircle className="w-8 h-8 text-destructive" />
              <CardTitle>Payment Error</CardTitle>
            </div>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => setLocation('/')}
              className="w-full"
              data-testid="button-go-home"
            >
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!authorization) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (executeMutation.isSuccess) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-8 h-8 text-green-500" />
              <CardTitle>Payment Successful!</CardTitle>
            </div>
            <CardDescription>
              The USDC transfer has been completed
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">From</span>
                <span className="font-mono" data-testid="text-from-address">
                  {formatAddress(authorization.message.from)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">To</span>
                <span className="font-mono" data-testid="text-to-address">
                  {formatAddress(authorization.message.to)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-semibold" data-testid="text-amount">
                  ${formatAmount(authorization.message.value)} USDC
                </span>
              </div>
              {executeMutation.data?.txHash && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Transaction</span>
                  <span className="font-mono text-xs" data-testid="text-txhash">
                    {formatAddress(executeMutation.data.txHash)}
                  </span>
                </div>
              )}
            </div>
            <Button
              onClick={() => setLocation('/home')}
              className="w-full"
              data-testid="button-view-wallet"
            >
              View Wallet
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Execute Payment</CardTitle>
          <CardDescription>
            {executeMutation.isPending
              ? 'Processing payment...'
              : 'Review payment details before confirming'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <span className="text-sm text-muted-foreground">From</span>
              <span className="font-mono text-sm" data-testid="text-from">
                {formatAddress(authorization.message.from)}
              </span>
            </div>
            
            <div className="flex justify-center">
              <ArrowRight className="w-5 h-5 text-muted-foreground" />
            </div>
            
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <span className="text-sm text-muted-foreground">To</span>
              <span className="font-mono text-sm" data-testid="text-to">
                {formatAddress(authorization.message.to)}
              </span>
            </div>
            
            <div className="flex items-center justify-between p-4 bg-primary/10 rounded-lg border border-primary/20">
              <span className="font-semibold">Amount</span>
              <span className="text-2xl font-bold" data-testid="text-payment-amount">
                ${formatAmount(authorization.message.value)}
              </span>
            </div>
          </div>

          {executeMutation.isPending ? (
            <Button disabled className="w-full" data-testid="button-processing">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processing Payment...
            </Button>
          ) : executeMutation.isError ? (
            <div className="space-y-2">
              <div className="text-sm text-destructive p-3 bg-destructive/10 rounded-lg">
                {error || 'Payment failed. Please try again.'}
              </div>
              <Button
                onClick={() => executeMutation.mutate()}
                className="w-full"
                data-testid="button-retry"
              >
                Retry Payment
              </Button>
            </div>
          ) : (
            <Button
              onClick={() => executeMutation.mutate()}
              className="w-full"
              data-testid="button-execute-payment"
            >
              Execute Payment
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
