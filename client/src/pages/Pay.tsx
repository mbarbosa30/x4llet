import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, XCircle, ArrowRight } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { getPrivateKey, getWallet } from '@/lib/wallet';
import { privateKeyToAccount } from 'viem/accounts';
import { getAddress, type Hex } from 'viem';
import { getNetworkConfig } from '@shared/networks';
import type { AuthorizationQR, TransferResponse, PaymentRequest, TransferRequest } from '@shared/schema';

// UTF-8 safe base64 decoding
function decodeBase64(str: string): string {
  return decodeURIComponent(Array.from(atob(str), c => 
    '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
  ).join(''));
}

export default function Pay() {
  const [, setLocation] = useLocation();
  const [authorization, setAuthorization] = useState<AuthorizationQR | null>(null);
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoExecute, setAutoExecute] = useState(false); // Don't auto-execute payment requests
  const [mode, setMode] = useState<'auth' | 'request' | null>(null);

  // Extract authorization or payment request from URL
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const authData = params.get('auth');
      const requestData = params.get('request');
      
      if (authData) {
        // Authorization QR (already signed, auto-execute)
        const decoded = decodeBase64(authData);
        const parsed = JSON.parse(decoded) as AuthorizationQR;
        setAuthorization(parsed);
        setMode('auth');
        setAutoExecute(true);
      } else if (requestData) {
        // Payment request (needs signing)
        const decoded = decodeBase64(requestData);
        const parsed = JSON.parse(decoded) as PaymentRequest;
        setPaymentRequest(parsed);
        setMode('request');
        setAutoExecute(false);
      } else {
        setError('No payment data found in URL');
      }
    } catch (err) {
      console.error('Failed to parse payment data:', err);
      setError('Invalid payment link. Please check the URL and try again.');
    }
  }, []);

  // Mutation for executing pre-signed authorizations
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

  // Mutation for signing and paying payment requests
  const payMutation = useMutation({
    mutationFn: async () => {
      if (!paymentRequest) {
        throw new Error('No payment request data');
      }

      // Check if wallet exists
      const wallet = await getWallet();
      if (!wallet) {
        throw new Error('Please create or unlock your wallet first');
      }

      const privateKey = await getPrivateKey();
      if (!privateKey) {
        throw new Error('Unable to access wallet');
      }

      const account = privateKeyToAccount(privateKey as `0x${string}`);
      const networkConfig = getNetworkConfig(
        paymentRequest.chainId === 8453 ? 'base' : 
        paymentRequest.chainId === 42161 ? 'arbitrum' : 
        paymentRequest.chainId === 100 ? 'gnosis' : 'celo'
      );
      
      const value = paymentRequest.amount;
      
      const nonceBytes = new Uint8Array(32);
      crypto.getRandomValues(nonceBytes);
      const nonce = `0x${Array.from(nonceBytes).map(b => b.toString(16).padStart(2, '0')).join('')}`;
      
      const validAfter = '0';
      const validBefore = Math.floor(Date.now() / 1000 + paymentRequest.ttl).toString();

      // Domain names vary by chain: Celo="USDC", Gnosis="Bridged USDC (Gnosis)", others="USD Coin"
      const getDomainName = (chain: number): string => {
        if (chain === 42220) return 'USDC';
        if (chain === 100) return 'Bridged USDC (Gnosis)';
        return 'USD Coin';
      };
      const domain = {
        name: getDomainName(networkConfig.chainId),
        version: '2',
        chainId: networkConfig.chainId,
        verifyingContract: getAddress(networkConfig.usdcAddress),
      };

      const message = {
        from: account.address,
        to: getAddress(paymentRequest.to),
        value: BigInt(value),
        validAfter: BigInt(validAfter),
        validBefore: BigInt(validBefore),
        nonce: nonce as `0x${string}`,
      };

      const signature = await account.signTypedData({
        domain,
        types: {
          TransferWithAuthorization: [
            { name: 'from', type: 'address' },
            { name: 'to', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'validAfter', type: 'uint256' },
            { name: 'validBefore', type: 'uint256' },
            { name: 'nonce', type: 'bytes32' },
          ],
        },
        primaryType: 'TransferWithAuthorization',
        message,
      });

      const typedData = {
        domain,
        types: {
          TransferWithAuthorization: [
            { name: 'from', type: 'address' },
            { name: 'to', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'validAfter', type: 'uint256' },
            { name: 'validBefore', type: 'uint256' },
            { name: 'nonce', type: 'bytes32' },
          ],
        },
        message: {
          from: message.from,
          to: message.to,
          value,
          validAfter,
          validBefore,
          nonce,
        },
      };

      const transferRequest: TransferRequest = {
        chainId: networkConfig.chainId,
        token: 'USDC',
        typedData,
        signature,
      };

      const res = await apiRequest('POST', '/api/relay/transfer-3009', transferRequest);
      return res.json() as Promise<TransferResponse>;
    },
    onSuccess: () => {
      // Success handled in UI
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to process payment');
    },
  });

  // Auto-execute authorization on load
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

  if (!authorization && !paymentRequest) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Success screen for both modes
  if (executeMutation.isSuccess || payMutation.isSuccess) {
    const txData = executeMutation.data || payMutation.data;
    const fromAddress = mode === 'auth' && authorization 
      ? authorization.message.from 
      : paymentRequest?.to || '';
    const toAddress = mode === 'auth' && authorization 
      ? authorization.message.to 
      : paymentRequest?.to || '';
    const amount = mode === 'auth' && authorization 
      ? authorization.message.value 
      : paymentRequest?.amount || '0';

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
                <span className="text-muted-foreground">Amount</span>
                <span className="font-semibold" data-testid="text-amount">
                  ${formatAmount(amount)} USDC
                </span>
              </div>
              {txData?.txHash && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Transaction</span>
                  <span className="font-mono text-xs" data-testid="text-txhash">
                    {formatAddress(txData.txHash)}
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

  // Main payment screen - handles both modes
  const currentMutation = mode === 'request' ? payMutation : executeMutation;
  const to = mode === 'request' && paymentRequest 
    ? paymentRequest.to 
    : authorization?.message.to || '';
  const amount = mode === 'request' && paymentRequest 
    ? paymentRequest.amount 
    : authorization?.message.value || '0';
  const description = mode === 'request' && paymentRequest ? paymentRequest.description : undefined;

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{mode === 'request' ? 'Payment Request' : 'Execute Payment'}</CardTitle>
          <CardDescription>
            {currentMutation.isPending
              ? 'Processing payment...'
              : mode === 'request'
              ? 'Review and confirm payment'
              : 'Executing pre-authorized payment'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {description && (
              <div className="p-3 bg-muted">
                <div className="text-sm text-muted-foreground mb-1">Description</div>
                <div className="text-sm font-medium">{description}</div>
              </div>
            )}
            
            <div className="flex items-center justify-between p-3 bg-muted">
              <span className="text-sm text-muted-foreground">Pay To</span>
              <span className="font-mono text-sm" data-testid="text-to">
                {formatAddress(to)}
              </span>
            </div>
            
            <div className="flex items-center justify-between p-4 bg-[#0055FF]/10 border border-[#0055FF]/20">
              <span className="font-semibold">Amount</span>
              <span className="text-2xl font-bold" data-testid="text-payment-amount">
                ${formatAmount(amount)} USDC
              </span>
            </div>
          </div>

          {currentMutation.isPending ? (
            <Button disabled className="w-full" data-testid="button-processing">
              <Loader2 className="w-4 h-4 animate-spin" />
              Processing Payment...
            </Button>
          ) : currentMutation.isError ? (
            <div className="space-y-2">
              <div className="text-sm text-destructive p-3 bg-destructive/10">
                {error || 'Payment failed. Please try again.'}
              </div>
              <Button
                onClick={() => currentMutation.mutate()}
                className="w-full"
                data-testid="button-retry"
              >
                Retry Payment
              </Button>
            </div>
          ) : (
            <Button
              onClick={() => currentMutation.mutate()}
              className="w-full"
              data-testid="button-execute-payment"
            >
              {mode === 'request' ? 'Pay Now' : 'Execute Payment'}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
