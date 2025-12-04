import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, QrCode, Scan, Clipboard, MessageSquare, Repeat, Loader2 } from 'lucide-react';
import NumericKeypad from '@/components/NumericKeypad';
import QRCodeDisplay from '@/components/QRCodeDisplay';
import QRScanner from '@/components/QRScanner';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getWallet, getPrivateKey, getPreferences } from '@/lib/wallet';
import { privateKeyToAccount } from 'viem/accounts';
import { getAddress } from 'viem';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { getNetworkConfig } from '@shared/networks';
import type { TransferRequest, TransferResponse, PaymentRequest, AuthorizationQR, BalanceResponse } from '@shared/schema';

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
  const [inputValue, setInputValue] = useState(''); // User's editing buffer in current currency
  const [usdcAmount, setUsdcAmount] = useState(''); // Canonical USDC amount (always in USDC)
  const [address, setAddress] = useState<string | null>(null);
  const [network, setNetwork] = useState<'base' | 'celo'>('celo');
  const [chainId, setChainId] = useState(42220);
  const [currency, setCurrency] = useState('USD');
  const [displayCurrency, setDisplayCurrency] = useState<'USDC' | 'fiat'>('USDC');
  const [showScanner, setShowScanner] = useState(false);
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null);
  const [authorizationQR, setAuthorizationQR] = useState<AuthorizationQR | null>(null);
  const [paymentLink, setPaymentLink] = useState<string | null>(null);
  const [isLoadingWallet, setIsLoadingWallet] = useState(true);
  const [earnMode, setEarnMode] = useState(false);
  const isTogglingRef = useRef(false);
  const lastConvertedRef = useRef<{value: string; currency: 'USDC' | 'fiat'}>({value: '', currency: 'USDC'});
  const hasAutoSelectedRef = useRef(false); // Track if we've auto-selected network

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
        setCurrency(prefs.currency);
        setEarnMode(prefs.earnMode || false);
        
        const storedRequest = sessionStorage.getItem('payment_request');
        if (storedRequest) {
          try {
            const request: PaymentRequest = JSON.parse(storedRequest);
            const requestNetwork = request.chainId === 42220 ? 'celo' : 'base';
            const requestChainId = request.chainId;
            
            // Set network to match payment request
            setNetwork(requestNetwork);
            setChainId(requestChainId);
            setPaymentRequest(request);
            setRecipient(request.to);
            const usdcValue = (parseInt(request.amount) / 1000000).toFixed(6);
            setUsdcAmount(usdcValue);
            setInputValue(usdcValue);
            setMode('online');
            setStep('input');
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

  // Fetch aggregated balance from all chains
  const { data: balanceData } = useQuery<BalanceResponse & { chains?: any }>({
    queryKey: ['/api/balance', address],
    enabled: !!address,
    refetchInterval: 10000,
    queryFn: async () => {
      const res = await fetch(`/api/balance/${address}`);
      if (!res.ok) throw new Error('Failed to fetch balance');
      return res.json();
    },
  });

  // Auto-select chain with highest balance only once on first load
  useEffect(() => {
    if (!balanceData?.chains || hasAutoSelectedRef.current) return;
    
    const baseBalance = BigInt(balanceData.chains.base.balanceMicro);
    const celoBalance = BigInt(balanceData.chains.celo.balanceMicro);
    
    // Select chain with more USDC
    const selectedNetwork = baseBalance > celoBalance ? 'base' : 'celo';
    const selectedChainId = baseBalance > celoBalance ? 8453 : 42220;
    
    setNetwork(selectedNetwork);
    setChainId(selectedChainId);
    hasAutoSelectedRef.current = true; // Mark as auto-selected, won't run again
  }, [balanceData?.chains]);

  const { data: exchangeRate } = useQuery<{ currency: string; rate: number }>({
    queryKey: ['/api/exchange-rate', currency],
    enabled: !!currency && currency !== 'USD',
  });

  // Fetch Aave balance when earn mode is enabled
  const { data: aaveBalance } = useQuery<{ totalAUsdcBalance: string; chains: any }>({
    queryKey: ['/api/aave/balance', address],
    enabled: !!address && earnMode,
    queryFn: async () => {
      const res = await fetch(`/api/aave/balance/${address}`);
      if (!res.ok) throw new Error('Failed to fetch Aave balance');
      return res.json();
    },
  });

  // Get balance for selected chain
  const selectedChainBalance = balanceData?.chains 
    ? (chainId === 8453 ? balanceData.chains.base.balance : balanceData.chains.celo.balance)
    : '0.00';
  const balance = selectedChainBalance;
  
  const rate = exchangeRate?.rate || 1;
  const rateLoaded = currency === 'USD' || !!exchangeRate;

  // Check if trying to send more than available balance
  const usdcAmountNum = parseFloat(usdcAmount) || 0;
  const balanceNum = parseFloat(balance) || 0;
  const isInsufficientBalance = usdcAmountNum > balanceNum && usdcAmountNum > 0;
  
  // Check if Aave funds could cover the difference
  const aaveUsdcAmount = aaveBalance ? parseFloat(aaveBalance.totalAUsdcBalance) / 1e6 : 0;
  const hasAaveFunds = aaveUsdcAmount > 0;
  const aaveCouldCover = hasAaveFunds && (balanceNum + aaveUsdcAmount) >= usdcAmountNum;

  const handleNetworkToggle = () => {
    const newNetwork = network === 'base' ? 'celo' : 'base';
    const newChainId = newNetwork === 'base' ? 8453 : 42220;
    setNetwork(newNetwork);
    setChainId(newChainId);
  };

  // Convert input to canonical USDC only when USER changes input (not when rate updates)
  useEffect(() => {
    // Skip during toggle to prevent precision loss from rounded inputValue
    if (isTogglingRef.current) {
      isTogglingRef.current = false;
      lastConvertedRef.current = {value: inputValue, currency: displayCurrency};
      return;
    }

    // Only convert if user actually changed something (not just rate update)
    if (lastConvertedRef.current.value === inputValue && 
        lastConvertedRef.current.currency === displayCurrency) {
      return; // Skip - only rate changed, not user input
    }

    // Update last converted tracking
    lastConvertedRef.current = {value: inputValue, currency: displayCurrency};

    if (!inputValue || inputValue === '') {
      setUsdcAmount('');
      return;
    }

    const numValue = parseFloat(inputValue);
    if (isNaN(numValue)) {
      return;
    }

    if (displayCurrency === 'USDC') {
      setUsdcAmount(inputValue);
    } else {
      // Convert fiat to USDC
      const usdc = numValue / rate;
      setUsdcAmount(usdc.toFixed(6));
    }
  }, [inputValue, displayCurrency, rate]);

  const sendMutation = useMutation({
    mutationFn: async (data: TransferRequest) => {
      const res = await apiRequest('POST', '/api/relay/transfer-3009', data);
      return await res.json() as TransferResponse;
    },
    onSuccess: (data: TransferResponse) => {
      if (!address) return;
      
      toast({
        title: "Transaction sent",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/balance', address] });
      queryClient.invalidateQueries({ queryKey: ['/api/transactions', address] });
      queryClient.invalidateQueries({ queryKey: ['/api/balance-history', address, chainId] });
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
    setInputValue(prev => prev + num);
  };

  const handleBackspace = () => {
    setInputValue(prev => prev.slice(0, -1));
  };

  const handleDecimal = () => {
    if (!inputValue.includes('.')) {
      setInputValue(prev => prev + '.');
    }
  };

  const handleCurrencyToggle = () => {
    // Only allow toggle if rate is loaded (or USD)
    if (!rateLoaded) {
      toast({
        title: "Loading Exchange Rate",
        description: "Please wait while we load the exchange rate",
      });
      return;
    }

    if (!usdcAmount) {
      // No amount entered, just toggle
      setDisplayCurrency(prev => prev === 'USDC' ? 'fiat' : 'USDC');
      return;
    }

    // Set flag to prevent useEffect from recalculating during toggle
    isTogglingRef.current = true;

    // When toggling, update inputValue to match the new currency display
    if (displayCurrency === 'USDC') {
      // Switching to fiat
      const fiatValue = parseFloat(usdcAmount) * rate;
      setInputValue(fiatValue.toFixed(2));
      setDisplayCurrency('fiat');
    } else {
      // Switching to USDC
      setInputValue(usdcAmount);
      setDisplayCurrency('USDC');
    }
  };

  const handleNext = () => {
    if (recipient && usdcAmount && parseFloat(usdcAmount) > 0) {
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
      const usdcValue = (parseInt(request.amount) / 1000000).toFixed(6);
      setUsdcAmount(usdcValue);
      setInputValue(usdcValue);
      setStep('confirm');
    } catch (error) {
      // If JSON parsing fails, treat it as a plain wallet address
      const trimmedData = data.trim();
      
      // Check if it looks like an Ethereum address (0x followed by 40 hex characters)
      if (/^0x[a-fA-F0-9]{40}$/.test(trimmedData)) {
        setRecipient(trimmedData);
        toast({
          title: "Address scanned",
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
      
      const value = Math.floor(parseFloat(usdcAmount) * 1000000).toString();
      
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
        title: "Payment link created",
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
      
      const value = Math.floor(parseFloat(usdcAmount) * 1000000).toString();
      
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
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">Loading wallet...</p>
        </div>
      </div>
    );
  }

  if (!address) {
    return null;
  }

  return (
    <div 
      className="min-h-screen bg-background"
      style={{ 
        paddingTop: 'calc(4rem + env(safe-area-inset-top))',
        paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))' 
      }}
    >
      <main className="max-w-md mx-auto p-4 space-y-6">
        {/* Page subheader */}
        <div className="flex items-center justify-between -mx-4 px-4 -mt-4 pt-4 pb-4 border-b">
          <div className="flex items-center gap-2">
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
            <h1 className="text-lg font-semibold">Send USDC</h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Only show network toggle if user has balance on both chains */}
            {balanceData?.chains && 
             BigInt(balanceData.chains.base.balanceMicro) > 0n && 
             BigInt(balanceData.chains.celo.balanceMicro) > 0n && (
              <Button 
                variant="outline"
                size="sm"
                onClick={handleNetworkToggle}
                className="text-xs h-7"
                data-testid="button-toggle-network"
              >
                {network === 'base' ? 'Base' : 'Celo'}
              </Button>
            )}
            <div className="text-sm text-muted-foreground" data-testid="text-balance">
              {balance} USDC
            </div>
          </div>
        </div>
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
                            title: "Address pasted",
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
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">
                    Amount ({displayCurrency === 'USDC' ? 'USDC' : currency})
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCurrencyToggle}
                    disabled={!rateLoaded && currency !== 'USD'}
                    data-testid="button-toggle-currency"
                  >
                    <Repeat className="h-4 w-4 mr-1" />
                    {displayCurrency === 'USDC' ? currency : 'USDC'}
                  </Button>
                </div>
                <div className="text-center py-4">
                  <div className="text-4xl font-semibold">
                    {inputValue || '0.00'}
                  </div>
                  {usdcAmount && displayCurrency === 'fiat' && (
                    <div className="text-sm text-muted-foreground mt-2">
                      ≈ {parseFloat(usdcAmount).toFixed(2)} USDC
                    </div>
                  )}
                  {usdcAmount && displayCurrency === 'USDC' && currency !== 'USD' && (
                    <div className="text-sm text-muted-foreground mt-2">
                      ≈ {(parseFloat(usdcAmount) * rate).toFixed(2)} {currency}
                    </div>
                  )}
                </div>
              </div>

              {/* Insufficient balance warning */}
              {isInsufficientBalance && (
                <Card className="p-3 bg-destructive/10 border-destructive/20">
                  <div className="text-sm">
                    <span className="text-destructive font-medium">Insufficient balance</span>
                    <span className="text-muted-foreground ml-1">
                      on {network === 'base' ? 'Base' : 'Celo'}
                    </span>
                  </div>
                  {earnMode && aaveCouldCover && (
                    <p className="text-xs text-muted-foreground mt-1">
                      You have ${aaveUsdcAmount.toFixed(2)} earning in Aave. Withdraw from Settings to use these funds.
                    </p>
                  )}
                  {!aaveCouldCover && balanceData?.chains && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Available: ${balanceNum.toFixed(2)} on {network === 'base' ? 'Base' : 'Celo'}
                      {network === 'base' && parseFloat(balanceData.chains.celo.balance) > 0 && 
                        ` (${balanceData.chains.celo.balance} on Celo)`}
                      {network === 'celo' && parseFloat(balanceData.chains.base.balance) > 0 && 
                        ` (${balanceData.chains.base.balance} on Base)`}
                    </p>
                  )}
                </Card>
              )}

              <NumericKeypad
                onNumberClick={handleNumberClick}
                onBackspace={handleBackspace}
                onDecimal={handleDecimal}
              />

              <Button 
                onClick={handleNext}
                disabled={!recipient || !usdcAmount || parseFloat(usdcAmount) <= 0 || isInsufficientBalance}
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
                <div className="text-2xl font-semibold">{usdcAmount} USDC</div>
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
                <div className="text-lg font-semibold">{usdcAmount} USDC</div>
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
                    title: "Link copied",
                  });
                }}
                className="w-full"
                data-testid="button-copy-link"
              >
                <Clipboard className="w-4 h-4 mr-2" />
                Copy Payment Link
              </Button>

              <Button 
                variant="outline"
                onClick={() => {
                  const message = `Please execute this payment for me: ${paymentLink}`;
                  const smsUrl = `sms:?body=${encodeURIComponent(message)}`;
                  window.location.href = smsUrl;
                  toast({
                    title: "Opening SMS",
                  });
                }}
                className="w-full"
                data-testid="button-share-sms"
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                Share via SMS
              </Button>

              <Button 
                variant="outline"
                onClick={() => {
                  setStep('input');
                  setRecipient('');
                  setInputValue('');
                  setUsdcAmount('');
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

      {showScanner && (
        <QRScanner
          onScan={handleScanRequest}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}
