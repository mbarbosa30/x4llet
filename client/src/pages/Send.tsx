import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, QrCode } from 'lucide-react';
import NumericKeypad from '@/components/NumericKeypad';
import { Card } from '@/components/ui/card';
import { getWallet, getPrivateKey, getPreferences } from '@/lib/wallet';
import { privateKeyToAccount } from 'viem/accounts';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { getNetworkConfig } from '@shared/networks';
import type { TransferRequest, TransferResponse } from '@shared/schema';

export default function Send() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [step, setStep] = useState<'input' | 'confirm'>('input');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [address, setAddress] = useState<string | null>(null);
  const [network, setNetwork] = useState<'base' | 'celo'>('base');

  useEffect(() => {
    const loadWallet = async () => {
      try {
        const wallet = await getWallet();
        if (!wallet) {
          setLocation('/');
          return;
        }
        setAddress(wallet.address);
        
        const prefs = await getPreferences();
        setNetwork(prefs.network);
      } catch (error: any) {
        if (error.message === 'RECOVERY_CODE_REQUIRED') {
          setLocation('/unlock');
        } else {
          setLocation('/');
        }
      }
    };
    loadWallet();
  }, [setLocation]);

  const sendMutation = useMutation({
    mutationFn: async (data: TransferRequest) => {
      const res = await apiRequest('POST', '/api/relay/transfer-3009', data);
      return await res.json() as TransferResponse;
    },
    onSuccess: (data: TransferResponse) => {
      toast({
        title: "Transaction Sent!",
        description: `Your USDC has been sent. Hash: ${data.txHash.slice(0, 10)}...`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/balance', address] });
      setLocation('/home');
    },
    onError: (error) => {
      toast({
        title: "Transaction Failed",
        description: error instanceof Error ? error.message : "Failed to send transaction",
        variant: "destructive",
      });
    },
  });

  const handleNumberClick = (num: string) => {
    setAmount(prev => prev + num);
  };

  const handleBackspace = () => {
    setAmount(prev => prev.slice(0, -1));
  };

  const handleDecimal = () => {
    if (!amount.includes('.')) {
      setAmount(prev => prev + '.');
    }
  };

  const handleNext = () => {
    if (recipient && amount && parseFloat(amount) > 0) {
      setStep('confirm');
    }
  };

  const handleConfirm = async () => {
    if (!address) return;
    
    try {
      const privateKey = await getPrivateKey();
      if (!privateKey) {
        throw new Error('No wallet found');
      }

      const account = privateKeyToAccount(privateKey as `0x${string}`);
      const networkConfig = getNetworkConfig(network);
      
      const value = Math.floor(parseFloat(amount) * 1000000).toString();
      const nonce = `0x${Array.from({ length: 32 }, () => 
        Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
      ).join('')}`;
      
      const validAfter = '0';
      const validBefore = Math.floor(Date.now() / 1000 + 600).toString();

      const typedData = {
        domain: {
          name: 'USD Coin',
          version: '2',
          chainId: networkConfig.chainId,
          verifyingContract: networkConfig.usdcAddress as `0x${string}`,
        },
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
          from: address,
          to: recipient,
          value,
          validAfter,
          validBefore,
          nonce,
        },
      };

      const signature = await account.signTypedData({
        domain: typedData.domain,
        types: typedData.types,
        primaryType: 'TransferWithAuthorization',
        message: typedData.message,
      });

      const transferRequest: TransferRequest = {
        chainId: networkConfig.chainId,
        token: 'USDC',
        typedData,
        signature,
      };

      sendMutation.mutate(transferRequest);
    } catch (error) {
      console.error('Error signing transaction:', error);
      toast({
        title: "Error",
        description: "Failed to sign transaction",
        variant: "destructive",
      });
    }
  };

  if (step === 'confirm') {
    return (
      <div className="min-h-screen bg-background">
        <header className="h-16 border-b flex items-center px-4">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setStep('input')}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold ml-2">Confirm Transaction</h1>
        </header>

        <main className="max-w-md mx-auto p-4 space-y-6">
          <Card className="p-6 space-y-4">
            <div>
              <div className="text-sm text-muted-foreground mb-1">To</div>
              <div className="font-mono text-sm break-all" data-testid="text-confirm-recipient">
                {recipient}
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="text-sm text-muted-foreground mb-1">Amount</div>
              <div className="text-3xl font-medium tabular-nums" data-testid="text-confirm-amount">
                {amount} USDC
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Network fee</span>
                <span className="font-medium text-primary">Free (Gasless)</span>
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="text-lg font-medium tabular-nums">{amount} USDC</span>
              </div>
            </div>
          </Card>

          <div className="space-y-2">
            <Button 
              onClick={handleConfirm}
              disabled={sendMutation.isPending}
              className="w-full" 
              size="lg"
              data-testid="button-confirm-send"
            >
              {sendMutation.isPending ? 'Sending...' : 'Confirm Send'}
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setStep('input')}
              disabled={sendMutation.isPending}
              className="w-full"
              data-testid="button-cancel"
            >
              Cancel
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="h-16 border-b flex items-center px-4">
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => setLocation('/home')}
          data-testid="button-back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold ml-2">Send USDC</h1>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-8">
        <div className="space-y-2">
          <label className="text-sm font-medium">Recipient</label>
          <div className="flex gap-2">
            <Input 
              placeholder="Address or @handle"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="flex-1 font-mono text-sm"
              data-testid="input-recipient"
            />
            <Button 
              variant="outline" 
              size="icon"
              onClick={() => console.log('Scan QR code - TODO')}
              data-testid="button-scan-qr"
            >
              <QrCode className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="text-center py-8">
          <div className="text-sm text-muted-foreground mb-2">Amount</div>
          <div className="text-4xl font-medium tabular-nums min-h-[3rem]" data-testid="text-amount-display">
            {amount || '0'} <span className="text-2xl text-muted-foreground">USDC</span>
          </div>
        </div>

        <NumericKeypad 
          onNumberClick={handleNumberClick}
          onBackspace={handleBackspace}
          onDecimal={handleDecimal}
          disabled={!recipient}
        />

        <Button 
          onClick={handleNext}
          disabled={!recipient || !amount || amount === '0' || parseFloat(amount) <= 0}
          className="w-full"
          size="lg"
          data-testid="button-next"
        >
          Next
        </Button>
      </main>
    </div>
  );
}
