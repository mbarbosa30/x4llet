import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, QrCode, Scan, Clipboard } from 'lucide-react';
import NumericKeypad from '@/components/NumericKeypad';
import QRCodeDisplay from '@/components/QRCodeDisplay';
import QRScanner from '@/components/QRScanner';
import Footer from '@/components/Footer';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getWallet, getPrivateKey, getPreferences } from '@/lib/wallet';
import { privateKeyToAccount } from 'viem/accounts';
import { getAddress } from 'viem';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { getNetworkConfig } from '@shared/networks';
import type { TransferRequest, TransferResponse, PaymentRequest, AuthorizationQR } from '@shared/schema';

// UTF-8 safe base64 encoding
function encodeBase64(str: string): string {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => {
    return String.fromCharCode(parseInt(p1, 16));
  }));
}

export default function Send() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [mode, setMode] = useState<'online' | 'offline'>('online');
  const [step, setStep] = useState<'input' | 'confirm' | 'qr'>('input');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [address, setAddress] = useState<string | null>(null);
  const [network, setNetwork] = useState<'base' | 'celo'>('celo');
  const [showScanner, setShowScanner] = useState(false);
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null);
  const [authorizationQR, setAuthorizationQR] = useState<AuthorizationQR | null>(null);
  const [paymentLink, setPaymentLink] = useState<string | null>(null);
  const [isLoadingWallet, setIsLoadingWallet] = useState(true);

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
        
        const storedRequest = sessionStorage.getItem('payment_request');
        if (storedRequest) {
          try {
            const request: PaymentRequest = JSON.parse(storedRequest);
            const requestNetwork = request.chainId === 42220 ? 'celo' : 'base';
            
            if (requestNetwork !== prefs.network) {
              toast({
                title: "Wrong Network",
                description: "Payment request is for a different network",
                variant: "destructive",
              });
            } else {
              setPaymentRequest(request);
              setRecipient(request.to);
              setAmount((parseInt(request.amount) / 1000000).toFixed(2));
              setMode('online');
              setStep('input');
            }
            sessionStorage.removeItem('payment_request');
          } catch (error) {
            console.error('Failed to parse payment request:', error);
          }
        }
      } catch (error: any) {
        if (error.message === 'RECOVERY_CODE_REQUIRED') {
          setLocation('/unlock');
        } else {
          setLocation('/');
        }
      } finally {
        setIsLoadingWallet(false);
      }
    };
    loadWallet();
  }, [setLocation, toast]);

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

  const handleScanRequest = (data: string) => {
    try {
      // Try parsing as JSON first (Payment Request format)
      const request: PaymentRequest = JSON.parse(data);
      
      if (request.chainId !== getNetworkConfig(network).chainId) {
        toast({
          title: "Wrong Network",
          description: "Payment request is for a different network",
          variant: "destructive",
        });
        return;
      }
      
      setPaymentRequest(request);
      setRecipient(request.to);
      setAmount((parseInt(request.amount) / 1000000).toFixed(2));
      setStep('confirm');
    } catch (error) {
      // If JSON parsing fails, treat it as a plain wallet address
      const trimmedData = data.trim();
      
      // Check if it looks like an Ethereum address (0x followed by 40 hex characters)
      if (/^0x[a-fA-F0-9]{40}$/.test(trimmedData)) {
        setRecipient(trimmedData);
        toast({
          title: "Address Scanned",
          description: "Enter amount to continue",
        });
      } else {
        toast({
          title: "Invalid QR Code",
          description: "Please scan a valid wallet address or payment request",
          variant: "destructive",
        });
      }
    }
  };

  const handleCreateAuthorizationQR = async () => {
    if (!address) return;
    
    try {
      const privateKey = await getPrivateKey();
      if (!privateKey) {
        throw new Error('No wallet found');
      }

      const account = privateKeyToAccount(privateKey as `0x${string}`);
      const networkConfig = getNetworkConfig(network);
      
      const value = Math.floor(parseFloat(amount) * 1000000).toString();
      
      const nonceBytes = new Uint8Array(32);
      crypto.getRandomValues(nonceBytes);
      const nonce = `0x${Array.from(nonceBytes).map(b => b.toString(16).padStart(2, '0')).join('')}`;
      
      const validAfter = '0';
      const validBefore = Math.floor(Date.now() / 1000 + (paymentRequest?.ttl || 600)).toString();

      // Both Base and Celo use standard chainId format, but Celo uses "USDC" as name
      const domain = {
        name: networkConfig.chainId === 8453 ? 'USD Coin' : 'USDC',
        version: '2',
        chainId: networkConfig.chainId,
        verifyingContract: getAddress(networkConfig.usdcAddress),
      };

      const message = {
        from: account.address,
        to: getAddress(recipient),
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

      const authQR: AuthorizationQR = {
        domain,
        message: {
          from: message.from,
          to: message.to,
          value,
          validAfter,
          validBefore,
          nonce,
        },
        signature,
      };

      // Generate shareable payment link (URL-safe base64 encoding)
      const authData = encodeBase64(JSON.stringify(authQR));
      const urlSafeAuthData = encodeURIComponent(authData);
      const baseUrl = window.location.origin;
      const link = `${baseUrl}/pay?auth=${urlSafeAuthData}`;

      setAuthorizationQR(authQR);
      setPaymentLink(link);
      setStep('qr');
      
      toast({
        title: "Payment Link Created!",
        description: "Anyone can execute this payment by scanning the QR or visiting the link",
      });
    } catch (error) {
      console.error('Error creating authorization:', error);
      toast({
        title: "Error",
        description: "Failed to create authorization",
        variant: "destructive",
      });
    }
  };

  const handleConfirm = async () => {
    if (!address) return;
    
    if (mode === 'offline') {
      await handleCreateAuthorizationQR();
      return;
    }
    
    try {
      const privateKey = await getPrivateKey();
      if (!privateKey) {
        throw new Error('No wallet found');
      }

      const account = privateKeyToAccount(privateKey as `0x${string}`);
      const networkConfig = getNetworkConfig(network);
      
      const value = Math.floor(parseFloat(amount) * 1000000).toString();
      
      const nonceBytes = new Uint8Array(32);
      crypto.getRandomValues(nonceBytes);
      const nonce = `0x${Array.from(nonceBytes).map(b => b.toString(16).padStart(2, '0')).join('')}`;
      
      const validAfter = '0';
      const validBefore = Math.floor(Date.now() / 1000 + 600).toString();

      // Both Base and Celo use standard chainId format, but Celo uses "USDC" as name
      const domain = {
        name: networkConfig.chainId === 8453 ? 'USD Coin' : 'USDC',
        version: '2',
        chainId: networkConfig.chainId,
        verifyingContract: getAddress(networkConfig.usdcAddress),
      };

      const message = {
        from: account.address,
        to: getAddress(recipient),
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

  if (isLoadingWallet) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto"></div>
          <p className="text-sm text-muted-foreground">Loading wallet...</p>
        </div>
      </div>
    );
  }

  if (!address) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="h-16 border-b flex items-center px-4">
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => {
            if (step !== 'input') {
              setStep('input');
              setPaymentRequest(null);
              setAuthorizationQR(null);
            } else {
              setLocation('/home');
            }
          }}
          data-testid="button-back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold ml-2">Send USDC</h1>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-6">
        {step === 'input' && (
          <>
            <Tabs value={mode} onValueChange={(v) => setMode(v as 'online' | 'offline')} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="online" data-testid="tab-online">Online</TabsTrigger>
                <TabsTrigger value="offline" data-testid="tab-offline">Offline</TabsTrigger>
              </TabsList>
            </Tabs>

            {mode === 'offline' && (
              <Card className="p-4 bg-muted/50">
                <p className="text-sm text-muted-foreground">
                  Offline mode creates a shareable payment link that anyone can execute. No internet required for signing - just share the link or QR code.
                </p>
              </Card>
            )}

            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="recipient" className="text-sm font-medium">
                  Recipient Address
                </label>
                <div className="flex gap-2">
                  <Input 
                    id="recipient"
                    placeholder="0x... or scan QR"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    className="flex-1"
                    data-testid="input-recipient"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={async () => {
                      try {
                        const text = await navigator.clipboard.readText();
                        if (/^0x[a-fA-F0-9]{40}$/.test(text.trim())) {
                          setRecipient(text.trim());
                          toast({
                            title: "Address Pasted",
                            description: "Recipient address set from clipboard",
                          });
                        } else {
                          toast({
                            title: "Invalid Address",
                            description: "Clipboard doesn't contain a valid wallet address",
                            variant: "destructive",
                          });
                        }
                      } catch (err) {
                        toast({
                          title: "Paste Failed",
                          description: "Could not read from clipboard",
                          variant: "destructive",
                        });
                      }
                    }}
                    data-testid="button-paste-address"
                  >
                    <Clipboard className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowScanner(true)}
                    data-testid="button-scan-request"
                  >
                    <Scan className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Amount (USDC)</label>
                <div className="text-4xl font-semibold text-center py-4">
                  {amount || '0.00'}
                </div>
              </div>

              <NumericKeypad
                onNumberClick={handleNumberClick}
                onBackspace={handleBackspace}
                onDecimal={handleDecimal}
              />

              <Button 
                onClick={handleNext}
                disabled={!recipient || !amount || parseFloat(amount) <= 0}
                className="w-full"
                size="lg"
                data-testid="button-next"
              >
                Continue
              </Button>
            </div>
          </>
        )}

        {step === 'confirm' && (
          <div className="space-y-6">
            <Card className="p-4 space-y-4">
              <div>
                <div className="text-sm text-muted-foreground mb-1">Sending</div>
                <div className="text-2xl font-semibold">{amount} USDC</div>
              </div>

              <div className="border-t pt-4">
                <div className="text-sm text-muted-foreground mb-1">To</div>
                <div className="font-mono text-sm break-all">{recipient}</div>
              </div>

              {paymentRequest?.description && (
                <div className="border-t pt-4">
                  <div className="text-sm text-muted-foreground mb-1">Description</div>
                  <div className="text-sm">{paymentRequest.description}</div>
                </div>
              )}

              {mode === 'offline' && (
                <div className="border-t pt-4">
                  <div className="text-sm text-muted-foreground mb-1">Mode</div>
                  <div className="text-sm">Offline Authorization (no network needed)</div>
                </div>
              )}
            </Card>

            <Button 
              onClick={handleConfirm}
              disabled={sendMutation.isPending}
              className="w-full"
              size="lg"
              data-testid="button-confirm"
            >
              {mode === 'offline' ? 'Create Authorization QR' : (sendMutation.isPending ? 'Sending...' : 'Confirm & Send')}
            </Button>

            <Button 
              variant="outline"
              onClick={() => {
                setStep('input');
                setPaymentRequest(null);
              }}
              className="w-full"
              data-testid="button-cancel"
            >
              Cancel
            </Button>
          </div>
        )}

        {step === 'qr' && authorizationQR && paymentLink && (
          <div className="space-y-6">
            <Card className="p-4">
              <div className="text-center space-y-2">
                <div className="text-sm text-muted-foreground">Payment Link Created</div>
                <div className="text-lg font-semibold">{amount} USDC</div>
              </div>
            </Card>

            <div className="text-center space-y-4">
              <div className="text-sm text-muted-foreground">
                Anyone can execute this payment by scanning the QR or visiting the link
              </div>
              <div className="flex justify-center">
                <QRCodeDisplay value={paymentLink} size={300} />
              </div>
              <p className="text-xs text-muted-foreground">
                This authorization is valid for {paymentRequest?.ttl || 600} seconds
              </p>
            </div>

            <div className="space-y-3">
              <Button 
                onClick={() => {
                  navigator.clipboard.writeText(paymentLink);
                  toast({
                    title: "Link Copied!",
                    description: "Payment link copied to clipboard",
                  });
                }}
                className="w-full"
                data-testid="button-copy-link"
              >
                Copy Payment Link
              </Button>

              <Button 
                variant="outline"
                onClick={() => {
                  setStep('input');
                  setRecipient('');
                  setAmount('');
                  setPaymentRequest(null);
                  setAuthorizationQR(null);
                  setPaymentLink(null);
                }}
                className="w-full"
                data-testid="button-new-payment"
              >
                New Payment
              </Button>
            </div>
          </div>
        )}
      </main>

      <Footer />

      {showScanner && (
        <QRScanner
          onScan={handleScanRequest}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}
