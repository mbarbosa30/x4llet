import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ChevronRight, Globe, DollarSign, Key, Copy, Check, Eye, EyeOff, Lock, Palette, BookOpen, HelpCircle, MessageCircleQuestion, TrendingDown, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import InstallPrompt from '@/components/InstallPrompt';
import { getWallet, getPreferences, savePreferences, getPrivateKey, lockWallet } from '@/lib/wallet';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ExchangeRateData {
  currency: string;
  rate: number;
}

interface InflationData {
  currency: string;
  dailyRate: number;
  monthlyRate: number;
  annualRate: number;
}

export default function Settings() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [address, setAddress] = useState<string | null>(null);
  const [currency, setCurrency] = useState('USD');
  const [language, setLanguage] = useState('en');
  const [network, setNetwork] = useState<'base' | 'celo'>('base');
  const [showExportPrivateKey, setShowExportPrivateKey] = useState(false);
  const [showCurrency, setShowCurrency] = useState(false);
  const [showNetwork, setShowNetwork] = useState(false);
  const [password, setPassword] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [showTheme, setShowTheme] = useState(false);

  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const wallet = await getWallet();
        if (wallet) {
          setAddress(wallet.address);
        }
        
        const prefs = await getPreferences();
        setCurrency(prefs.currency);
        setLanguage(prefs.language);
        setNetwork(prefs.network);
        
        // Load theme from localStorage
        const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
        const initialTheme = savedTheme || 'light';
        setTheme(initialTheme);
        
        // Apply theme to document
        if (initialTheme === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      } catch (error) {
        console.error('Failed to load preferences:', error);
      }
    };
    loadPreferences();
  }, []);


  const handleCurrencyChange = async (newCurrency: string) => {
    setCurrency(newCurrency);
    await savePreferences({ currency: newCurrency, language, network });
    toast({
      title: "Currency Updated",
      description: `Display currency changed to ${newCurrency}`,
    });
    setShowCurrency(false);
  };

  const handleNetworkChange = async (newNetwork: 'base' | 'celo') => {
    setNetwork(newNetwork);
    await savePreferences({ currency, language, network: newNetwork });
    toast({
      title: "Network Updated",
      description: `Network changed to ${newNetwork === 'base' ? 'Base' : 'Celo'}`,
    });
    setShowNetwork(false);
  };

  const handleExportPrivateKey = async () => {
    if (!password || password.length < 8) {
      toast({
        title: "Invalid Password",
        description: "Please enter your password",
        variant: "destructive",
      });
      return;
    }

    try {
      const key = await getPrivateKey(password);
      if (!key) {
        toast({
          title: "Export Failed",
          description: "Invalid password",
          variant: "destructive",
        });
        return;
      }
      
      setPrivateKey(key);
      setPassword('');
    } catch (error) {
      console.error('Export failed:', error);
      toast({
        title: "Export Failed",
        description: "Invalid password",
        variant: "destructive",
      });
    }
  };

  const handleCopyPrivateKey = async () => {
    try {
      await navigator.clipboard.writeText(privateKey);
      setCopied(true);
      toast({
        title: "Copied!",
        description: "Private key copied to clipboard",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleClosePrivateKeyDialog = () => {
    setShowExportPrivateKey(false);
    setPrivateKey('');
    setPassword('');
    setShowPassword(false);
    setShowPrivateKey(false);
    setCopied(false);
  };

  const handleLockWallet = () => {
    lockWallet();
    toast({
      title: "Wallet Locked",
      description: "Your wallet has been locked for security",
    });
    setLocation('/unlock');
  };

  const handleThemeChange = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    
    // Apply theme to document
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    
    toast({
      title: "Theme Updated",
      description: `Theme changed to ${newTheme} mode`,
    });
    setShowTheme(false);
  };

  // Fetch exchange rate for selected currency
  const { data: exchangeRate } = useQuery<ExchangeRateData>({
    queryKey: ['/api/exchange-rate', currency],
    enabled: currency !== 'USD',
    queryFn: async () => {
      const res = await fetch(`/api/exchange-rate/${currency}`);
      if (!res.ok) throw new Error('Failed to fetch exchange rate');
      return res.json();
    },
  });

  // Fetch inflation data for selected currency
  const { data: inflationData } = useQuery<InflationData>({
    queryKey: ['/api/inflation-rate', currency],
    enabled: currency !== 'USD',
    queryFn: async () => {
      const res = await fetch(`/api/inflation-rate/${currency}`);
      if (!res.ok) throw new Error('Failed to fetch inflation rate');
      return res.json();
    },
  });

  return (
    <div 
      className="min-h-screen bg-background"
      style={{ 
        paddingTop: 'calc(4rem + env(safe-area-inset-top))',
        paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))' 
      }}
    >
      <main className="max-w-md mx-auto p-4 space-y-8">
        <InstallPrompt />

        <div className="space-y-2">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-2">
            Security
          </h2>
          <Card className="divide-y">
            <button
              onClick={() => setShowExportPrivateKey(true)}
              className="w-full flex items-center justify-between p-4 hover-elevate"
              data-testid="button-export-private-key"
            >
              <div className="flex items-center gap-3">
                <Key className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium">Export Private Key</span>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
            <button
              onClick={handleLockWallet}
              className="w-full flex items-center justify-between p-4 hover-elevate"
              data-testid="button-lock-wallet"
            >
              <div className="flex items-center gap-3">
                <Lock className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium">Lock Wallet</span>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
          </Card>
        </div>

        <div className="space-y-2">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-2">
            Network
          </h2>
          <Card>
            <button
              onClick={() => setShowNetwork(true)}
              className="w-full flex items-center justify-between p-4 hover-elevate"
              data-testid="button-network"
            >
              <div className="flex items-center gap-3">
                <Globe className="h-5 w-5 text-muted-foreground" />
                <div className="text-left">
                  <div className="text-sm font-medium">Network</div>
                  <div className="text-xs text-muted-foreground">
                    {network === 'base' ? 'Base' : 'Celo'}
                  </div>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
          </Card>
        </div>

        <div className="space-y-2">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-2">
            Preferences
          </h2>
          <Card className="divide-y">
            <button
              onClick={() => setShowTheme(true)}
              className="w-full flex items-center justify-between p-4 hover-elevate"
              data-testid="button-theme"
            >
              <div className="flex items-center gap-3">
                <Palette className="h-5 w-5 text-muted-foreground" />
                <div className="text-left">
                  <div className="text-sm font-medium">Theme</div>
                  <div className="text-xs text-muted-foreground capitalize">{theme}</div>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
            <button
              onClick={() => setShowCurrency(true)}
              className="w-full flex items-center justify-between p-4 hover-elevate"
              data-testid="button-currency"
            >
              <div className="flex items-center gap-3">
                <DollarSign className="h-5 w-5 text-muted-foreground" />
                <div className="text-left">
                  <div className="text-sm font-medium">Display Currency</div>
                  <div className="text-xs text-muted-foreground">{currency}</div>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
          </Card>

          {currency !== 'USD' && (exchangeRate || inflationData) && (
            <Card className="p-4" data-testid="card-currency-info">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-medium">{currency} vs USD</h3>
                </div>
                
                {exchangeRate && (
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Exchange Rate</div>
                    <div className="text-base font-medium tabular-nums">
                      1 USD = {exchangeRate.rate.toLocaleString(undefined, { 
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 6 
                      })} {currency}
                    </div>
                  </div>
                )}

                {inflationData && inflationData.monthlyRate !== 0 && (
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Inflation Rate</div>
                    <div className="flex items-center gap-2">
                      {inflationData.monthlyRate > 0 ? (
                        <TrendingDown className="h-4 w-4 text-destructive" />
                      ) : (
                        <TrendingUp className="h-4 w-4 text-green-600" />
                      )}
                      <div className="text-base font-medium tabular-nums">
                        {inflationData.monthlyRate > 0 ? '+' : ''}{(inflationData.monthlyRate * 100).toFixed(2)}% /month
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {inflationData.annualRate > 0 ? '+' : ''}{(inflationData.annualRate * 100).toFixed(2)}% /year
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-2">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-2">
            Help & Resources
          </h2>
          <Card className="divide-y">
            <button
              onClick={() => setLocation('/context')}
              className="w-full flex items-center justify-between p-4 hover-elevate"
              data-testid="button-context"
            >
              <div className="flex items-center gap-3">
                <HelpCircle className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium">Context</span>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
            <button
              onClick={() => setLocation('/how-it-works')}
              className="w-full flex items-center justify-between p-4 hover-elevate"
              data-testid="button-how-it-works"
            >
              <div className="flex items-center gap-3">
                <BookOpen className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium">How It Works</span>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
            <button
              onClick={() => setLocation('/faqs')}
              className="w-full flex items-center justify-between p-4 hover-elevate"
              data-testid="button-faqs"
            >
              <div className="flex items-center gap-3">
                <MessageCircleQuestion className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium">FAQs</span>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
          </Card>
        </div>

        <div className="pt-4">
          <button
            onClick={() => {
              // Force hard refresh by adding timestamp to URL
              window.location.href = window.location.href.split('?')[0] + '?refresh=' + Date.now();
            }}
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="Click to refresh and get latest version"
            data-testid="button-version-refresh"
          >
            Version 1.0.0
          </button>
          <p className="text-center text-xs text-muted-foreground/60 mt-1">
            Tap version to refresh
          </p>
        </div>
      </main>

      <Dialog open={showExportPrivateKey} onOpenChange={handleClosePrivateKeyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Private Key</DialogTitle>
            <DialogDescription>
              {!privateKey ? (
                "Enter your password to view your private key"
              ) : (
                "Your private key gives full access to your wallet. Never share it with anyone."
              )}
            </DialogDescription>
          </DialogHeader>
          
          {!privateKey ? (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="export-password">Password</Label>
                <div className="relative">
                  <Input
                    id="export-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleExportPrivateKey()}
                    data-testid="input-export-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    data-testid="button-toggle-export-password"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Your Private Key</Label>
                <div className="space-y-2">
                  <div className="relative">
                    <div className="font-mono text-xs break-all bg-muted p-3 rounded-md border" data-testid="text-exported-private-key">
                      {showPrivateKey ? privateKey : '•'.repeat(66)}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPrivateKey(!showPrivateKey)}
                      className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                      data-testid="button-toggle-private-key-visibility"
                    >
                      {showPrivateKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleCopyPrivateKey}
                    data-testid="button-copy-exported-private-key"
                  >
                    {copied ? (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-2" />
                        Copy Private Key
                      </>
                    )}
                  </Button>
                </div>
              </div>
              
              <div className="pt-2 space-y-2 text-xs text-muted-foreground bg-destructive/10 p-3 rounded-md border border-destructive/20">
                <p className="font-medium text-destructive">⚠️ Security Warning</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>Anyone with this key can access your funds</li>
                  <li>Never share it with anyone</li>
                  <li>Store it in a secure location</li>
                </ul>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={handleClosePrivateKeyDialog} data-testid="button-close-export">
              {privateKey ? 'Close' : 'Cancel'}
            </Button>
            {!privateKey && (
              <Button onClick={handleExportPrivateKey} data-testid="button-confirm-export">
                View Private Key
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCurrency} onOpenChange={setShowCurrency}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Display Currency</DialogTitle>
            <DialogDescription>
              Choose your preferred currency for fiat values
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={currency} onValueChange={handleCurrencyChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD - US Dollar</SelectItem>
                <SelectItem value="EUR">EUR - Euro</SelectItem>
                <SelectItem value="GBP">GBP - British Pound</SelectItem>
                <SelectItem value="JPY">JPY - Japanese Yen</SelectItem>
                <SelectItem value="ARS">ARS - Argentine Peso</SelectItem>
                <SelectItem value="BRL">BRL - Brazilian Real</SelectItem>
                <SelectItem value="MXN">MXN - Mexican Peso</SelectItem>
                <SelectItem value="NGN">NGN - Nigerian Naira</SelectItem>
                <SelectItem value="KES">KES - Kenyan Shilling</SelectItem>
                <SelectItem value="INR">INR - Indian Rupee</SelectItem>
                <SelectItem value="CAD">CAD - Canadian Dollar</SelectItem>
                <SelectItem value="AUD">AUD - Australian Dollar</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showNetwork} onOpenChange={setShowNetwork}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Network</DialogTitle>
            <DialogDescription>
              Choose which blockchain network to use
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={network} onValueChange={(v) => handleNetworkChange(v as 'base' | 'celo')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="base">Base</SelectItem>
                <SelectItem value="celo">Celo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showTheme} onOpenChange={setShowTheme}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Theme</DialogTitle>
            <DialogDescription>
              Choose your preferred appearance
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={theme} onValueChange={(v) => handleThemeChange(v as 'light' | 'dark')}>
              <SelectTrigger data-testid="select-theme">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
