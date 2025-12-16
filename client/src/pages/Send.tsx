import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useLocation } from 'wouter';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Scan, Clipboard, Repeat, Loader2, MessageSquare, ChevronDown, Check } from 'lucide-react';
import NumericKeypad from '@/components/NumericKeypad';
import QRCodeDisplay from '@/components/QRCodeDisplay';

// Lazy load QR scanner to reduce initial bundle size
const QRScanner = lazy(() => import('@/components/QRScanner'));
import { getPrivateKey } from '@/lib/wallet';
import { useWallet } from '@/hooks/useWallet';
import { useBalance } from '@/hooks/useBalance';
import { useAaveBalance } from '@/hooks/useAaveBalance';
import { privateKeyToAccount } from 'viem/accounts';
import { getAddress } from 'viem';
import { useToast } from '@/hooks/use-toast';
import { useExchangeRate } from '@/hooks/useExchangeRate';
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
  const { address, currency, earnMode, isLoading: isLoadingWallet } = useWallet({ loadPreferences: true });
  
  const [step, setStep] = useState<'input' | 'confirm' | 'qr'>('input');
  const [recipient, setRecipient] = useState('');
  const [inputValue, setInputValue] = useState(''); // User's editing buffer in current currency
  const [usdcAmount, setUsdcAmount] = useState(''); // Canonical USDC amount (always in USDC)
  const [network, setNetwork] = useState<'base' | 'celo' | 'gnosis' | 'arbitrum'>('celo');
  const [chainId, setChainId] = useState(42220);
  const [displayCurrency, setDisplayCurrency] = useState<'USDC' | 'fiat'>('USDC');
  const [showScanner, setShowScanner] = useState(false);
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null);
  const [authorizationQR, setAuthorizationQR] = useState<AuthorizationQR | null>(null);
  const [paymentLink, setPaymentLink] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showChainSelector, setShowChainSelector] = useState(false);
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
    if (isLoadingWallet) return;
    
    const storedRequest = sessionStorage.getItem('payment_request');
    if (storedRequest) {
      try {
        const request: PaymentRequest = JSON.parse(storedRequest);
        const requestNetwork = request.chainId === 42220 ? 'celo' : request.chainId === 100 ? 'gnosis' : request.chainId === 42161 ? 'arbitrum' : 'base';
        const requestChainId = request.chainId;
        
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
  }, [isLoadingWallet]);

  // Fetch aggregated balance from all chains (no polling - fetched once on mount)
  const { data: balanceData } = useBalance(address);

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

  const { data: exchangeRate } = useExchangeRate(currency);

  // Fetch Aave balance when earn mode is enabled
  const { data: aaveBalance } = useAaveBalance(address, earnMode);

  // Get balance for selected chain
  const selectedChainBalance = balanceData?.chains 
    ? (network === 'base' ? balanceData.chains.base.balance 
       : network === 'gnosis' ? balanceData.chains.gnosis.balance 
       : network === 'arbitrum' ? balanceData.chains.arbitrum?.balance || '0.00'
       : balanceData.chains.celo.balance)
    : '0.00';
  const balance = selectedChainBalance;
  
  // Default chain list (used when balance data is loading)
  const defaultChains = [
    { network: 'base' as const, chainId: 8453, balance: '--', balanceMicro: 0n },
    { network: 'celo' as const, chainId: 42220, balance: '--', balanceMicro: 0n },
    { network: 'gnosis' as const, chainId: 100, balance: '--', balanceMicro: 0n },
    { network: 'arbitrum' as const, chainId: 42161, balance: '--', balanceMicro: 0n },
  ];
  
  // Get all chains for selector (show all, not just ones with balance)
  const allChains = balanceData?.chains ? [
    { network: 'base' as const, chainId: 8453, balance: balanceData.chains.base.balance, balanceMicro: BigInt(balanceData.chains.base.balanceMicro) },
    { network: 'celo' as const, chainId: 42220, balance: balanceData.chains.celo.balance, balanceMicro: BigInt(balanceData.chains.celo.balanceMicro) },
    { network: 'gnosis' as const, chainId: 100, balance: balanceData.chains.gnosis.balance, balanceMicro: BigInt(balanceData.chains.gnosis.balanceMicro) },
    { network: 'arbitrum' as const, chainId: 42161, balance: balanceData.chains.arbitrum?.balance || '0.00', balanceMicro: BigInt(balanceData.chains.arbitrum?.balanceMicro || '0') },
  ] : defaultChains;
  
  // Filter for chains with balance (used elsewhere)
  const chainsWithBalance = allChains.filter(c => c.balanceMicro > 0n);
  
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
      // Immediate invalidation for instant feedback on Home page
      queryClient.invalidateQueries({ queryKey: ['/api/balance', address] });
      queryClient.invalidateQueries({ queryKey: ['/api/transactions', address] });
      // Delayed refetch after 4s to capture confirmed transaction with accurate balance
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/balance', address] });
        queryClient.invalidateQueries({ queryKey: ['/api/transactions', address] });
        queryClient.invalidateQueries({ queryKey: ['/api/balance-history', address, chainId] });
      }, 4000);
      
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
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Loading Wallet</p>
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
      <main className="max-w-md mx-auto p-4 space-y-4">
        {step === 'input' && (
          <>
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input 
                  id="recipient"
                  placeholder="0x..."
                  aria-label="Recipient wallet address"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  className="flex-1 font-mono border border-foreground/10"
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
                      // Clipboard access may be blocked by browser permissions or require HTTPS
                      const isSecure = window.isSecureContext;
                      toast({
                        title: "Paste Failed",
                        description: isSecure 
                          ? "Clipboard access denied. Please allow clipboard permissions or paste manually." 
                          : "Clipboard requires a secure connection (HTTPS).",
                        variant: "destructive",
                      });
                    }
                  }}
                  className="h-10 w-10 border border-foreground/10 bg-background hover:bg-muted active:bg-muted/80 flex items-center justify-center"
                  data-testid="button-paste-address"
                >
                  <Clipboard className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setShowScanner(true)}
                  className="h-10 w-10 border border-foreground/10 bg-background hover:bg-muted active:bg-muted/80 flex items-center justify-center"
                  data-testid="button-scan-request"
                >
                  <Scan className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-2">
                <div className="text-center py-6 border border-foreground/10 bg-background">
                  <div className="text-5xl font-bold tabular-nums tracking-tight font-mono">
                    {inputValue || '0.00'}
                  </div>
                  <button
                    onClick={handleCurrencyToggle}
                    disabled={!rateLoaded && currency !== 'USD'}
                    className="mt-2 text-sm text-muted-foreground font-mono disabled:opacity-50 flex items-center justify-center gap-1 mx-auto"
                    data-testid="button-toggle-currency"
                  >
                    <Repeat className="h-3 w-3" />
                    {displayCurrency === 'USDC' ? 'USDC' : currency}
                    {displayCurrency === 'fiat' && (
                      <span className="text-foreground/60">= {(parseFloat(usdcAmount) || 0).toFixed(2)} USDC</span>
                    )}
                    {displayCurrency === 'USDC' && currency !== 'USD' && (
                      <span className="text-foreground/60">= {((parseFloat(usdcAmount) || 0) * rate).toFixed(2)} {currency}</span>
                    )}
                  </button>
                  <div className="relative flex flex-col items-center mt-3">
                    <button
                      onClick={() => setShowChainSelector(!showChainSelector)}
                      className="flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
                      data-testid="button-chain-selector"
                    >
                      <span className={`inline-flex items-center justify-center w-4 h-4 text-[8px] font-bold text-white ${
                        network === 'base' ? 'bg-blue-500' : 
                        network === 'celo' ? 'bg-yellow-500' : 
                        network === 'arbitrum' ? 'bg-cyan-500' :
                        'bg-green-600'
                      }`}>
                        {network === 'base' ? 'B' : network === 'celo' ? 'C' : network === 'arbitrum' ? 'A' : 'G'}
                      </span>
                      <span data-testid="text-balance">{balance} USDC on {network.toUpperCase()}</span>
                      <ChevronDown className={`h-3 w-3 transition-transform ${showChainSelector ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {showChainSelector && (
                      <div className="absolute top-full mt-2 z-50 border border-foreground/10 bg-background shadow-lg min-w-48">
                        {!balanceData?.chains ? (
                          <div className="px-3 py-3 text-xs font-mono text-muted-foreground flex items-center gap-2">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Loading balances...
                          </div>
                        ) : chainsWithBalance.length > 0 ? (
                          chainsWithBalance.map((chain) => (
                            <button
                              key={chain.network}
                              onClick={() => {
                                handleNetworkChange(chain.network);
                                setShowChainSelector(false);
                              }}
                              className="w-full flex items-center justify-between gap-3 px-3 py-2 text-xs font-mono hover:bg-muted transition-colors"
                              data-testid={`chain-option-${chain.network}`}
                            >
                              <div className="flex items-center gap-2">
                                <span className={`inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold text-white ${
                                  chain.network === 'base' ? 'bg-blue-500' : 
                                  chain.network === 'celo' ? 'bg-yellow-500' : 
                                  chain.network === 'arbitrum' ? 'bg-cyan-500' :
                                  'bg-green-600'
                                }`}>
                                  {chain.network === 'base' ? 'B' : chain.network === 'celo' ? 'C' : chain.network === 'arbitrum' ? 'A' : 'G'}
                                </span>
                                <span>{chain.network.toUpperCase()}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">{chain.balance} USDC</span>
                                {chain.network === network && <Check className="h-3 w-3 text-[#0055FF]" />}
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="px-3 py-2 text-xs font-mono text-muted-foreground">
                            No chains with balance
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {isInsufficientBalance && (
                <div className="border-2 border-destructive bg-destructive/10 p-2 font-mono text-xs text-destructive text-center" data-testid="text-insufficient-balance">
                  Insufficient balance
                  {earnMode && aaveCouldCover && (
                    <span className="block text-muted-foreground mt-1">{aaveUsdcAmount.toFixed(2)} in savings</span>
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
                className="w-full h-12 border border-foreground/10 bg-[#0055FF] text-white font-mono text-sm uppercase tracking-widest hover:bg-[#0044CC] active:bg-[#0033AA] disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="button-next"
              >
                Review
              </button>
            </div>
          </>
        )}

        {step === 'confirm' && (
          <div className="space-y-4">
            <div className="border border-foreground/10 bg-background">
              <div className="p-4 border-b border-foreground/10">
                <div className="font-mono text-xs text-muted-foreground mb-1">Amount</div>
                <div className="text-3xl font-bold font-mono">{usdcAmount} USDC</div>
                {currency !== 'USD' && rate > 0 && parseFloat(usdcAmount) > 0 && (
                  <div className="text-sm text-muted-foreground mt-1 font-mono" data-testid="text-fiat-equivalent">
                    = {(parseFloat(usdcAmount) * rate).toLocaleString(undefined, { maximumFractionDigits: rate >= 100 ? 0 : 2 })} {currency}
                  </div>
                )}
              </div>

              <div className="p-4 border-b border-foreground/10">
                <div className="font-mono text-xs text-muted-foreground mb-1">To</div>
                <div className="font-mono text-xs break-all">{recipient}</div>
              </div>

              <div className="p-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2" data-testid="text-network">
                  <span className={`inline-flex items-center justify-center w-5 h-5 text-[10px] font-mono font-bold text-white ${
                    network === 'base' ? 'bg-blue-500' : 
                    network === 'celo' ? 'bg-yellow-500' : 
                    network === 'arbitrum' ? 'bg-cyan-500' :
                    'bg-green-600'
                  }`}>
                    {network === 'base' ? 'B' : network === 'celo' ? 'C' : network === 'arbitrum' ? 'A' : 'G'}
                  </span>
                  <span className="font-mono text-xs">{network.toUpperCase()}</span>
                </div>
                <div className="font-mono text-xs text-green-600 dark:text-green-400" data-testid="text-no-fees">
                  Zero fees
                </div>
              </div>

              {paymentRequest?.description && (
                <div className="p-3 border-t border-foreground/10">
                  <div className="font-mono text-xs text-muted-foreground mb-1">Note</div>
                  <div className="text-sm font-mono">{paymentRequest.description}</div>
                </div>
              )}

              {!isOnline && (
                <div className="p-3 border-t border-foreground/10 bg-muted">
                  <div className="font-mono text-xs text-muted-foreground">Offline mode - will create shareable link</div>
                </div>
              )}
            </div>

            <button 
              onClick={handleConfirm}
              disabled={sendMutation.isPending}
              className="w-full h-12 border border-foreground/10 bg-[#0055FF] text-white font-mono text-sm uppercase tracking-widest hover:bg-[#0044CC] active:bg-[#0033AA] disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="button-confirm"
            >
              {!isOnline ? 'Create Link' : (sendMutation.isPending ? 'Sending...' : 'Send')}
            </button>

            <button 
              onClick={() => {
                setStep('input');
                setPaymentRequest(null);
              }}
              className="w-full h-10 border border-foreground/10 bg-background font-mono text-sm hover:bg-muted active:bg-muted/80"
              data-testid="button-cancel"
            >
              Back
            </button>
          </div>
        )}

        {step === 'qr' && authorizationQR && paymentLink && (
          <div className="space-y-6">
            <div className="border border-foreground/10 bg-background p-4 text-center">
              <div className="text-2xl font-bold font-mono">{usdcAmount} USDC</div>
            </div>

            <div className="text-center space-y-4">
              <div className="flex justify-center border border-foreground/10 p-4 bg-white">
                <QRCodeDisplay value={paymentLink} size={280} />
              </div>
              <p className="font-mono text-xs text-muted-foreground">
                Expires in {Math.floor((paymentRequest?.ttl || 600) / 60)} min
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
                className="w-full h-12 border border-foreground/10 bg-[#0055FF] text-white font-mono text-sm uppercase tracking-widest hover:bg-[#0044CC] active:bg-[#0033AA] flex items-center justify-center gap-2"
                data-testid="button-copy-link"
              >
                <Clipboard className="w-4 h-4" />
                Copy Link
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
                className="w-full h-12 border border-foreground/10 bg-background font-mono text-sm uppercase tracking-widest hover:bg-muted active:bg-muted/80 flex items-center justify-center gap-2"
                data-testid="button-share-sms"
              >
                <MessageSquare className="w-4 h-4" />
                Share SMS
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
                className="w-full h-12 border border-foreground/10 bg-background font-mono text-sm uppercase tracking-widest hover:bg-muted active:bg-muted/80"
                data-testid="button-new-payment"
              >
                New Payment
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
