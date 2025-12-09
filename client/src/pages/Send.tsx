import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useLocation } from 'wouter';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Scan, Clipboard, Repeat, Loader2, ChevronDown, MessageSquare } from 'lucide-react';
import NumericKeypad from '@/components/NumericKeypad';
import QRCodeDisplay from '@/components/QRCodeDisplay';

// Lazy load QR scanner to reduce initial bundle size
const QRScanner = lazy(() => import('@/components/QRScanner'));
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
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
  
  const [step, setStep] = useState<'input' | 'confirm' | 'qr'>('input');
  const [recipient, setRecipient] = useState('');
  const [inputValue, setInputValue] = useState(''); // User's editing buffer in current currency
  const [usdcAmount, setUsdcAmount] = useState(''); // Canonical USDC amount (always in USDC)
  const [address, setAddress] = useState<string | null>(null);
  const [network, setNetwork] = useState<'base' | 'celo' | 'gnosis' | 'arbitrum'>('celo');
  const [chainId, setChainId] = useState(42220);
  const [currency, setCurrency] = useState('USD');
  const [displayCurrency, setDisplayCurrency] = useState<'USDC' | 'fiat'>('USDC');
  const [showScanner, setShowScanner] = useState(false);
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null);
  const [authorizationQR, setAuthorizationQR] = useState<AuthorizationQR | null>(null);
  const [paymentLink, setPaymentLink] = useState<string | null>(null);
  const [isLoadingWallet, setIsLoadingWallet] = useState(true);
  const [earnMode, setEarnMode] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const isTogglingRef = useRef(false);
  const lastConvertedRef = useRef<{value: string; currency: 'USDC' | 'fiat'}>({value: '', currency: 'USDC'});
  const hasAutoSelectedRef = useRef(false); // Track if we've auto-selected network

  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Scroll to top on page load and step changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [step]);

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
            const requestNetwork = request.chainId === 42220 ? 'celo' : request.chainId === 100 ? 'gnosis' : request.chainId === 42161 ? 'arbitrum' : 'base';
            const requestChainId = request.chainId;
            
            // Set network to match payment request
            setNetwork(requestNetwork);
            setChainId(requestChainId);
            setPaymentRequest(request);
            setRecipient(request.to);
            const usdcValue = (parseInt(request.amount) / 1000000).toFixed(6);
            setUsdcAmount(usdcValue);
            setInputValue(usdcValue);
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

  // Fetch aggregated balance from all chains (no polling - fetched once on mount)
  const { data: balanceData } = useQuery<BalanceResponse & { chains?: any }>({
    queryKey: ['/api/balance', address],
    enabled: !!address,
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
    const gnosisBalance = BigInt(balanceData.chains.gnosis.balanceMicro);
    const arbitrumBalance = BigInt(balanceData.chains.arbitrum?.balanceMicro || '0');
    
    // Select chain with most USDC
    const balances = [
      { network: 'base' as const, chainId: 8453, balance: baseBalance },
      { network: 'celo' as const, chainId: 42220, balance: celoBalance },
      { network: 'gnosis' as const, chainId: 100, balance: gnosisBalance },
      { network: 'arbitrum' as const, chainId: 42161, balance: arbitrumBalance },
    ];
    const best = balances.reduce((a, b) => a.balance > b.balance ? a : b);
    
    setNetwork(best.network);
    setChainId(best.chainId);
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
    ? (network === 'base' ? balanceData.chains.base.balance 
       : network === 'gnosis' ? balanceData.chains.gnosis.balance 
       : network === 'arbitrum' ? balanceData.chains.arbitrum?.balance || '0.00'
       : balanceData.chains.celo.balance)
    : '0.00';
  const balance = selectedChainBalance;
  
  // Get chains with USDC balance for selector
  const chainsWithBalance = balanceData?.chains ? [
    { network: 'base' as const, chainId: 8453, balance: balanceData.chains.base.balance, balanceMicro: BigInt(balanceData.chains.base.balanceMicro) },
    { network: 'celo' as const, chainId: 42220, balance: balanceData.chains.celo.balance, balanceMicro: BigInt(balanceData.chains.celo.balanceMicro) },
    { network: 'gnosis' as const, chainId: 100, balance: balanceData.chains.gnosis.balance, balanceMicro: BigInt(balanceData.chains.gnosis.balanceMicro) },
    { network: 'arbitrum' as const, chainId: 42161, balance: balanceData.chains.arbitrum?.balance || '0.00', balanceMicro: BigInt(balanceData.chains.arbitrum?.balanceMicro || '0') },
  ].filter(c => c.balanceMicro > 0n) : [];
  
  const handleNetworkChange = (newNetwork: 'base' | 'celo' | 'gnosis' | 'arbitrum') => {
    const chainIds = { base: 8453, celo: 42220, gnosis: 100, arbitrum: 42161 };
    setNetwork(newNetwork);
    setChainId(chainIds[newNetwork]);
  };
  
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
        description: `${usdcAmount} USDC sent to ${recipient.slice(0, 6)}...${recipient.slice(-4)}`,
      });
      // Immediate invalidation to clear stale data
      queryClient.invalidateQueries({ queryKey: ['/api/balance', address] });
      queryClient.invalidateQueries({ queryKey: ['/api/transactions', address] });
      queryClient.invalidateQueries({ queryKey: ['/api/balance-history', address, chainId] });
      
      // Delayed refetch after 5 seconds to capture confirmed transaction
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/balance', address] });
        queryClient.invalidateQueries({ queryKey: ['/api/transactions', address] });
      }, 5000);
      
      setLocation('/home');
    },
    onError: async (error) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorLower = errorMessage.toLowerCase();
      const isServerError = /^5\d{2}:/.test(errorMessage);
      const isNetworkUnreachable = /^0:/.test(errorMessage);
      const isFetchError = error instanceof TypeError || 
                           errorLower.includes('failed to fetch') ||
                           errorLower.includes('fetch failed') ||
                           errorLower.includes('networkerror') ||
                           errorLower.includes('network request failed') ||
                           errorLower.includes('load failed') ||
                           !navigator.onLine ||
                           isServerError ||
                           isNetworkUnreachable;
      
      if (isFetchError) {
        toast({
          title: "Network unavailable",
          description: "Creating offline payment link...",
        });
        try {
          await handleCreateAuthorizationQR();
        } catch (qrError) {
          toast({
            title: "Could not create offline payment",
            description: "Please check your connection and try again.",
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "Transaction Failed",
          description: errorMessage.replace(/^\d+:\s*/, ''),
          variant: "destructive",
        });
      }
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
        description: `${usdcAmount} USDC authorization ready to share`,
      });
    } catch (error) {
      console.error('Error creating authorization:', error);
      throw error;
    }
  };

  const handleConfirm = async () => {
    if (!address) return;
    
    if (!isOnline) {
      try {
        await handleCreateAuthorizationQR();
      } catch (error) {
        toast({
          title: "Could not create offline payment",
          description: error instanceof Error ? error.message : "Please try again.",
          variant: "destructive",
        });
      }
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
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">// LOADING_WALLET</p>
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
        <div className="flex items-center gap-2" data-testid="progress-indicator">
          <div className={`flex-1 h-1 ${step === 'input' ? 'bg-[#0055FF]' : step === 'confirm' || step === 'qr' ? 'bg-[#0055FF]' : 'bg-muted'}`} />
          <div className={`flex-1 h-1 ${step === 'confirm' ? 'bg-[#0055FF]' : step === 'qr' ? 'bg-[#0055FF]' : 'bg-muted'}`} />
          <div className={`flex-1 h-1 ${step === 'qr' ? 'bg-[#0055FF]' : 'bg-muted'}`} />
        </div>
        <div className="flex items-center justify-between font-mono text-xs uppercase tracking-widest text-muted-foreground">
          <span className={step === 'input' ? 'text-foreground' : ''}>// 01_AMOUNT</span>
          <span className={step === 'confirm' ? 'text-foreground' : ''}>// 02_REVIEW</span>
          <span className={step === 'qr' ? 'text-foreground' : ''}>// 03_COMPLETE</span>
        </div>

        {step === 'input' && (
          <>
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-2">
                  // RECIPIENT_ADDRESS
                </div>
                <div className="flex gap-2">
                  <Input 
                    id="recipient"
                    placeholder="0x..."
                    aria-label="Recipient wallet address"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    className="flex-1 font-mono border-2 border-foreground"
                    data-testid="input-recipient"
                  />
                  <button
                    onClick={async () => {
                      try {
                        const text = await navigator.clipboard.readText();
                        if (/^0x[a-fA-F0-9]{40}$/.test(text.trim())) {
                          const addr = text.trim();
                          setRecipient(addr);
                          toast({
                            title: "Address pasted",
                            description: `${addr.slice(0, 6)}...${addr.slice(-4)} set as recipient`,
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
                    className="h-9 w-9 border-2 border-foreground bg-background hover:bg-foreground/5 active:bg-foreground/10 flex items-center justify-center"
                    data-testid="button-paste-address"
                  >
                    <Clipboard className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setShowScanner(true)}
                    className="h-9 w-9 border-2 border-foreground bg-background hover:bg-foreground/5 active:bg-foreground/10 flex items-center justify-center"
                    data-testid="button-scan-request"
                  >
                    <Scan className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                    // AMOUNT_{displayCurrency === 'USDC' ? 'USDC' : currency}
                  </span>
                  <button
                    onClick={handleCurrencyToggle}
                    disabled={!rateLoaded && currency !== 'USD'}
                    className="h-8 px-3 border-2 border-foreground bg-background hover:bg-foreground/5 active:bg-foreground/10 font-mono text-xs uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    data-testid="button-toggle-currency"
                  >
                    <Repeat className="h-3 w-3" />
                    {displayCurrency === 'USDC' ? currency : 'USDC'}
                  </button>
                </div>
                <div className="text-center py-6 border-2 border-foreground bg-background">
                  <div className="text-5xl font-bold tabular-nums tracking-tight font-mono">
                    {inputValue || '0.00'}
                  </div>
                  {displayCurrency === 'fiat' && (
                    <div className="text-sm text-muted-foreground mt-2 font-mono">
                      = {(parseFloat(usdcAmount) || 0).toFixed(2)} USDC
                    </div>
                  )}
                  {displayCurrency === 'USDC' && currency !== 'USD' && (
                    <div className="text-sm text-muted-foreground mt-2 font-mono">
                      = {((parseFloat(usdcAmount) || 0) * rate).toFixed(2)} {currency}
                    </div>
                  )}
                  <div className="flex items-center justify-center gap-1.5 mt-4 text-xs font-mono uppercase tracking-widest text-muted-foreground">
                    <span 
                      className={`w-2 h-2 ${isOnline ? 'bg-green-500' : 'bg-muted-foreground/50'}`}
                      title={isOnline ? 'Online' : 'Offline'}
                      data-testid="status-connection"
                    />
                    <span data-testid="text-balance">// {balance} USDC</span>
                    {chainsWithBalance.length > 1 ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button 
                            className="px-2 py-0.5 border border-foreground bg-background hover:bg-foreground/5 font-mono text-xs uppercase tracking-widest flex items-center gap-1"
                            data-testid="button-network-selector"
                          >
                            {network === 'base' ? 'BASE' : network === 'celo' ? 'CELO' : network === 'arbitrum' ? 'ARBITRUM' : 'GNOSIS'}
                            <ChevronDown className="h-3 w-3" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="center" className="border-2 border-foreground">
                          {chainsWithBalance.map((chain) => (
                            <DropdownMenuItem 
                              key={chain.network}
                              onClick={() => handleNetworkChange(chain.network)}
                              className="font-mono uppercase tracking-widest text-xs"
                              data-testid={`button-network-${chain.network}`}
                            >
                              // {chain.network === 'base' ? 'BASE' : chain.network === 'celo' ? 'CELO' : chain.network === 'arbitrum' ? 'ARBITRUM' : 'GNOSIS'}
                              <span className="ml-2 text-muted-foreground">{chain.balance}</span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <span className="font-medium">
                        // {network === 'base' ? 'BASE' : network === 'celo' ? 'CELO' : network === 'arbitrum' ? 'ARBITRUM' : 'GNOSIS'}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {isInsufficientBalance && (
                <div className="border-2 border-destructive bg-destructive/10 p-3 font-mono text-xs uppercase tracking-widest text-destructive text-center" data-testid="text-insufficient-balance">
                  // ERROR: INSUFFICIENT_BALANCE
                  {earnMode && aaveCouldCover && (
                    <span className="block text-muted-foreground mt-1">// ${aaveUsdcAmount.toFixed(2)} AVAILABLE_SAVINGS</span>
                  )}
                </div>
              )}

              <NumericKeypad
                onNumberClick={handleNumberClick}
                onBackspace={handleBackspace}
                onDecimal={handleDecimal}
              />

              <button 
                onClick={handleNext}
                disabled={!recipient || !usdcAmount || parseFloat(usdcAmount) <= 0 || isInsufficientBalance}
                className="w-full h-12 border-2 border-foreground bg-[#0055FF] text-white font-mono text-sm uppercase tracking-widest hover:bg-[#0044CC] active:bg-[#0033AA] disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="button-next"
              >
                // CONTINUE
              </button>
            </div>
          </>
        )}

        {step === 'confirm' && (
          <div className="space-y-6">
            <div className="border-2 border-foreground bg-background">
              <div className="p-4 border-b-2 border-foreground">
                <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-2">// AMOUNT</div>
                <div className="text-3xl font-bold font-mono">{usdcAmount} USDC</div>
                {currency !== 'USD' && rate > 0 && parseFloat(usdcAmount) > 0 && (
                  <div className="text-sm text-muted-foreground mt-1 font-mono" data-testid="text-fiat-equivalent">
                    // = {(parseFloat(usdcAmount) * rate).toLocaleString(undefined, { maximumFractionDigits: rate >= 100 ? 0 : 2 })} {currency}
                  </div>
                )}
              </div>

              <div className="p-4 border-b-2 border-foreground">
                <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-2">// RECIPIENT</div>
                <div className="font-mono text-xs break-all">{recipient}</div>
              </div>

              <div className="p-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2" data-testid="text-network">
                  <span className={`inline-flex items-center justify-center w-5 h-5 text-[10px] font-mono font-bold text-white ${
                    network === 'base' ? 'bg-blue-500' : 
                    network === 'celo' ? 'bg-yellow-500' : 
                    network === 'arbitrum' ? 'bg-cyan-500' :
                    'bg-green-600'
                  }`}>
                    {network === 'base' ? 'B' : network === 'celo' ? 'C' : network === 'arbitrum' ? 'A' : 'G'}
                  </span>
                  <span className="font-mono text-xs uppercase tracking-widest">// {network.toUpperCase()}</span>
                </div>
                <div className="font-mono text-xs uppercase tracking-widest text-green-600 dark:text-green-400" data-testid="text-no-fees">
                  // ZERO_FEES
                </div>
              </div>

              {paymentRequest?.description && (
                <div className="p-4 border-t-2 border-foreground">
                  <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-2">// NOTE</div>
                  <div className="text-sm font-mono">{paymentRequest.description}</div>
                </div>
              )}

              {!isOnline && (
                <div className="p-4 border-t-2 border-foreground bg-muted">
                  <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-2">// MODE</div>
                  <div className="font-mono text-xs uppercase tracking-widest">// OFFLINE_AUTHORIZATION</div>
                </div>
              )}
            </div>

            <button 
              onClick={handleConfirm}
              disabled={sendMutation.isPending}
              className="w-full h-12 border-2 border-foreground bg-[#0055FF] text-white font-mono text-sm uppercase tracking-widest hover:bg-[#0044CC] active:bg-[#0033AA] disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="button-confirm"
            >
              {!isOnline ? '// CREATE_AUTHORIZATION' : (sendMutation.isPending ? '// SENDING...' : '// CONFIRM_SEND')}
            </button>

            <button 
              onClick={() => {
                setStep('input');
                setPaymentRequest(null);
              }}
              className="w-full h-12 border-2 border-foreground bg-background font-mono text-sm uppercase tracking-widest hover:bg-foreground/5 active:bg-foreground/10"
              data-testid="button-cancel"
            >
              // CANCEL
            </button>
          </div>
        )}

        {step === 'qr' && authorizationQR && paymentLink && (
          <div className="space-y-6">
            <div className="border-2 border-foreground bg-background p-4">
              <div className="text-center space-y-2">
                <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">// PAYMENT_CREATED</div>
                <div className="text-2xl font-bold font-mono">{usdcAmount} USDC</div>
              </div>
            </div>

            <div className="text-center space-y-4">
              <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                // SCAN_QR_OR_SHARE_LINK
              </div>
              <div className="flex justify-center border-2 border-foreground p-4 bg-white">
                <QRCodeDisplay value={paymentLink} size={280} />
              </div>
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                // EXPIRES: {paymentRequest?.ttl || 600}s
              </p>
            </div>

            <div className="space-y-3">
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(paymentLink);
                  toast({
                    title: "Payment link copied",
                    description: `${usdcAmount} USDC payment link copied to clipboard`,
                  });
                }}
                className="w-full h-12 border-2 border-foreground bg-[#0055FF] text-white font-mono text-sm uppercase tracking-widest hover:bg-[#0044CC] active:bg-[#0033AA] flex items-center justify-center gap-2"
                data-testid="button-copy-link"
              >
                <Clipboard className="w-4 h-4" />
                // COPY_LINK
              </button>

              <button 
                onClick={() => {
                  const message = `Please execute this payment for me: ${paymentLink}`;
                  const smsUrl = `sms:?body=${encodeURIComponent(message)}`;
                  window.location.href = smsUrl;
                  toast({
                    title: "Opening SMS",
                    description: "Sharing payment link via text message",
                  });
                }}
                className="w-full h-12 border-2 border-foreground bg-background font-mono text-sm uppercase tracking-widest hover:bg-foreground/5 active:bg-foreground/10 flex items-center justify-center gap-2"
                data-testid="button-share-sms"
              >
                <MessageSquare className="w-4 h-4" />
                // SHARE_SMS
              </button>

              <button 
                onClick={() => {
                  setStep('input');
                  setRecipient('');
                  setInputValue('');
                  setUsdcAmount('');
                  setPaymentRequest(null);
                  setAuthorizationQR(null);
                  setPaymentLink(null);
                }}
                className="w-full h-12 border-2 border-foreground bg-background font-mono text-sm uppercase tracking-widest hover:bg-foreground/5 active:bg-foreground/10"
                data-testid="button-new-payment"
              >
                // NEW_PAYMENT
              </button>
            </div>
          </div>
        )}
      </main>

      {showScanner && (
        <Suspense fallback={<div className="fixed inset-0 bg-background/80 flex items-center justify-center z-50"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
          <QRScanner
            onScan={handleScanRequest}
            onClose={() => setShowScanner(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
