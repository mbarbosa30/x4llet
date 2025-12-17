import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ChevronRight, DollarSign, Key, Copy, Check, Eye, EyeOff, Lock, Palette, BookOpen, HelpCircle, MessageCircleQuestion, TrendingDown, TrendingUp, RotateCcw, Loader2, AlertTriangle, Fingerprint, Trash2, Timer, Shield, FileText } from 'lucide-react';
import { queryClient } from '@/lib/queryClient';
import { Card } from '@/components/ui/card';
import InstallPrompt from '@/components/InstallPrompt';
import { getPreferences, savePreferences, getPrivateKey, lockWallet, enrollWalletPasskey, removeWalletPasskey, canUsePasskey, setAutoLockMinutes, getAutoLockMinutes, getMnemonic, getMnemonicWithPassword, hasMnemonicWallet } from '@/lib/wallet';
import { useWallet } from '@/hooks/useWallet';
import { getPasskeySupportStatus, hasPasskeyEnrolled, getPasskeyInfo, type PasskeySupportStatus } from '@/lib/webauthn';
import { useToast } from '@/hooks/use-toast';
import { useExchangeRate } from '@/hooks/useExchangeRate';
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
import { Switch } from '@/components/ui/switch';

interface InflationData {
  currency: string;
  dailyRate: number;
  monthlyRate: number;
  annualRate: number;
}

export default function Settings() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { address, currency: initialCurrency, isLoading: isLoadingWallet } = useWallet({ redirectOnMissing: false, loadPreferences: true });
  const [currency, setCurrency] = useState('USD');
  const [language, setLanguage] = useState('en');
  const [showExportPrivateKey, setShowExportPrivateKey] = useState(false);
  const [showCurrency, setShowCurrency] = useState(false);
  const [password, setPassword] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [showTheme, setShowTheme] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showPasskeyDialog, setShowPasskeyDialog] = useState(false);
  const [passkeySupportStatus, setPasskeySupportStatus] = useState<PasskeySupportStatus | null>(null);
  const [passkeyEnrolled, setPasskeyEnrolled] = useState(false);
  const [isEnrollingPasskey, setIsEnrollingPasskey] = useState(false);
  const [isRemovingPasskey, setIsRemovingPasskey] = useState(false);
  const [autoLock, setAutoLock] = useState(0);
  const [showAutoLock, setShowAutoLock] = useState(false);
  const [sessionPersistence, setSessionPersistence] = useState(true);
  const [showRecoveryPhrase, setShowRecoveryPhrase] = useState(false);
  const [recoveryPhrase, setRecoveryPhrase] = useState('');
  const [showRecoveryPhraseWords, setShowRecoveryPhraseWords] = useState(false);
  const [copiedPhrase, setCopiedPhrase] = useState(false);
  const [hasMnemonic, setHasMnemonic] = useState(false);
  const [recoveryPhrasePassword, setRecoveryPhrasePassword] = useState('');
  const [showRecoveryPhrasePassword, setShowRecoveryPhrasePassword] = useState(false);

  useEffect(() => {
    if (isLoadingWallet) return;
    setCurrency(initialCurrency);
  }, [isLoadingWallet, initialCurrency]);

  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const prefs = await getPreferences();
        setLanguage(prefs.language);
        
        const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
        const initialTheme = savedTheme || 'light';
        setTheme(initialTheme);
        
        if (initialTheme === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }

        const supportStatus = await getPasskeySupportStatus();
        setPasskeySupportStatus(supportStatus);
        
        if (supportStatus.supported) {
          const enrolled = await hasPasskeyEnrolled();
          setPasskeyEnrolled(enrolled);
        }
        
        const mnemonicExists = await hasMnemonicWallet();
        setHasMnemonic(mnemonicExists);
        
        const currentAutoLock = prefs.autoLockMinutes ?? 0;
        if (currentAutoLock === -1) {
          setSessionPersistence(false);
          setAutoLock(0);
        } else {
          setSessionPersistence(true);
          setAutoLock(currentAutoLock);
        }
        setAutoLockMinutes(currentAutoLock);
      } catch (error) {
        console.error('Failed to load preferences:', error);
      }
    };
    loadPreferences();
  }, []);

  const handleCurrencyChange = async (newCurrency: string) => {
    setCurrency(newCurrency);
    await savePreferences({ currency: newCurrency, language, autoLockMinutes: autoLock });
    toast({
      title: "Currency updated",
      description: `Display currency set to ${newCurrency}`,
    });
    setShowCurrency(false);
  };

  const handleSessionPersistenceToggle = async () => {
    const newValue = !sessionPersistence;
    setSessionPersistence(newValue);
    
    if (newValue) {
      // Enable persistence with current auto-lock timer
      setAutoLockMinutes(autoLock);
      await savePreferences({ currency, language, autoLockMinutes: autoLock });
      toast({
        title: "Session persistence enabled",
        description: `Wallet stays unlocked across refreshes. Auto-locks after ${autoLock} minutes.`,
      });
    } else {
      // Disable persistence - set to -1
      setAutoLockMinutes(-1);
      await savePreferences({ currency, language, autoLockMinutes: -1 });
      toast({
        title: "Session persistence disabled",
        description: "Password required on every page refresh.",
      });
    }
  };

  const handleAutoLockChange = async (minutes: number) => {
    setAutoLock(minutes);
    setAutoLockMinutes(minutes);
    await savePreferences({ currency, language, autoLockMinutes: minutes });
    
    let description: string;
    if (minutes === 0) {
      description = "Wallet will lock when you close the tab";
    } else {
      description = `Wallet will lock after ${minutes} minutes of inactivity`;
    }
    
    toast({
      title: "Auto-lock updated",
      description,
    });
    setShowAutoLock(false);
  };

  const getAutoLockLabel = (minutes: number) => {
    if (minutes === 0) return "When tab closes";
    return `${minutes} minutes`;
  };

  const handleResetAppData = async () => {
    setIsResetting(true);
    try {
      // 1. Clear React Query cache
      queryClient.clear();
      
      // 2. Unregister all service workers
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(reg => reg.unregister()));
      }
      
      // 3. Clear all caches (Cache API)
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }
      
      // 4. Clear IndexedDB databases
      if ('indexedDB' in window) {
        const databases = await indexedDB.databases?.() || [];
        await Promise.all(databases.map(db => {
          if (db.name) {
            return new Promise<void>((resolve, reject) => {
              const req = indexedDB.deleteDatabase(db.name!);
              req.onsuccess = () => resolve();
              req.onerror = () => reject(req.error);
              req.onblocked = () => resolve(); // Continue even if blocked
            });
          }
          return Promise.resolve();
        }));
      }
      
      // 5. Clear localStorage and sessionStorage
      localStorage.clear();
      sessionStorage.clear();
      
      // 6. Show success and reload
      toast({
        title: "App data cleared",
        description: "Reloading...",
      });
      
      // Small delay to show the toast, then reload
      setTimeout(() => {
        window.location.href = '/';
      }, 500);
    } catch (error) {
      console.error('Reset failed:', error);
      setIsResetting(false);
      toast({
        title: "Reset failed",
        description: "Please try again or clear browser data manually",
        variant: "destructive",
      });
    }
  };

  const handleExportPrivateKey = async () => {
    if (!password || password.length < 6) {
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
        title: "Private key copied",
        description: "Your private key has been copied to clipboard",
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

  const handleViewRecoveryPhrase = async () => {
    let phrase = await getMnemonic();
    
    if (!phrase && recoveryPhrasePassword) {
      if (recoveryPhrasePassword.length < 6) {
        toast({
          title: "Invalid Password",
          description: "Please enter your recovery code",
          variant: "destructive",
        });
        return;
      }
      phrase = await getMnemonicWithPassword(recoveryPhrasePassword);
    }
    
    if (phrase) {
      setRecoveryPhrase(phrase);
      setRecoveryPhrasePassword('');
    } else {
      toast({
        title: "Invalid recovery code",
        description: "Please check your recovery code and try again",
        variant: "destructive",
      });
    }
  };

  const handleCopyRecoveryPhrase = async () => {
    try {
      await navigator.clipboard.writeText(recoveryPhrase);
      setCopiedPhrase(true);
      toast({
        title: "Recovery phrase copied",
        description: "Your recovery phrase has been copied to clipboard",
      });
      setTimeout(() => setCopiedPhrase(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleCloseRecoveryPhraseDialog = () => {
    setShowRecoveryPhrase(false);
    setRecoveryPhrase('');
    setShowRecoveryPhraseWords(false);
    setCopiedPhrase(false);
    setRecoveryPhrasePassword('');
    setShowRecoveryPhrasePassword(false);
  };

  const handleLockWallet = () => {
    lockWallet();
    toast({
      title: "Wallet locked",
      description: "Your wallet has been securely locked",
    });
    setLocation('/unlock');
  };

  const handleThemeChange = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    
    toast({
      title: "Theme updated",
      description: `Switched to ${newTheme} mode`,
    });
    setShowTheme(false);
  };

  const handleEnrollPasskey = async () => {
    setIsEnrollingPasskey(true);
    try {
      const success = await enrollWalletPasskey();
      if (success) {
        setPasskeyEnrolled(true);
        toast({
          title: "Passkey enabled",
          description: "You can now unlock with Face ID or fingerprint",
        });
        setShowPasskeyDialog(false);
      }
    } catch (error: any) {
      toast({
        title: "Failed to enable passkey",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsEnrollingPasskey(false);
    }
  };

  const handleRemovePasskey = async () => {
    setIsRemovingPasskey(true);
    try {
      await removeWalletPasskey();
      setPasskeyEnrolled(false);
      toast({
        title: "Passkey removed",
        description: "You'll need to use your recovery code to unlock",
      });
      setShowPasskeyDialog(false);
    } catch (error: any) {
      toast({
        title: "Failed to remove passkey",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsRemovingPasskey(false);
    }
  };

  const { data: exchangeRate } = useExchangeRate(currency);

  const { data: inflationData } = useQuery<InflationData>({
    queryKey: ['/api/inflation-rate', currency],
    enabled: currency !== 'USD',
    staleTime: 24 * 60 * 60 * 1000, // 24 hours - inflation rates rarely change
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
      <main className="max-w-md mx-auto p-4 space-y-6">
        <InstallPrompt />

        <div className="space-y-2">
          <h2 className="text-xs font-mono font-semibold uppercase tracking-widest text-muted-foreground px-2">
            Security
          </h2>
          <Card className="divide-y">
            <button
              onClick={() => setShowPasskeyDialog(true)}
              className="w-full flex items-center justify-between p-4 hover-elevate"
              data-testid="button-passkey"
            >
              <div className="flex items-center gap-3">
                <Fingerprint className={`h-5 w-5 ${passkeySupportStatus?.supported ? 'text-muted-foreground' : 'text-muted-foreground/50'}`} />
                <div className="text-left">
                  <div className={`font-label text-foreground ${!passkeySupportStatus?.supported ? 'text-muted-foreground' : ''}`}>
                    Passkey Unlock
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {passkeyEnrolled 
                      ? 'Enabled' 
                      : passkeySupportStatus?.supported 
                        ? 'Use Face ID or fingerprint'
                        : passkeySupportStatus?.message || 'Checking availability...'}
                  </div>
                </div>
              </div>
              {passkeyEnrolled ? (
                <Check className="h-5 w-5 text-primary" />
              ) : passkeySupportStatus?.supported ? (
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-muted-foreground/50" />
              )}
            </button>
            {hasMnemonic && (
              <button
                onClick={() => setShowRecoveryPhrase(true)}
                className="w-full flex items-center justify-between p-4 hover-elevate"
                data-testid="button-view-recovery-phrase"
              >
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <span className="font-label text-foreground">View Recovery Phrase</span>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </button>
            )}
            <button
              onClick={() => setShowExportPrivateKey(true)}
              className="w-full flex items-center justify-between p-4 hover-elevate"
              data-testid="button-export-private-key"
            >
              <div className="flex items-center gap-3">
                <Key className="h-5 w-5 text-muted-foreground" />
                <span className="font-label text-foreground">Export Private Key</span>
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
                <span className="font-label text-foreground">Lock Wallet</span>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
            <button
              onClick={() => handleSessionPersistenceToggle()}
              className="w-full flex items-center justify-between p-4 hover-elevate"
              data-testid="button-session-persistence"
            >
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-muted-foreground" />
                <div className="text-left">
                  <div className="font-label text-foreground">Stay Logged In</div>
                  <div className="text-xs text-muted-foreground">
                    {sessionPersistence ? 'Session persists across refreshes' : 'Password required every refresh'}
                  </div>
                </div>
              </div>
              <Switch 
                checked={sessionPersistence} 
                onCheckedChange={() => handleSessionPersistenceToggle()}
                onClick={(e) => e.stopPropagation()}
                data-testid="switch-session-persistence"
              />
            </button>
            {sessionPersistence && (
              <button
                onClick={() => setShowAutoLock(true)}
                className="w-full flex items-center justify-between p-4 hover-elevate"
                data-testid="button-auto-lock"
              >
                <div className="flex items-center gap-3">
                  <Timer className="h-5 w-5 text-muted-foreground" />
                  <div className="text-left">
                    <div className="font-label text-foreground">Auto-Lock Timer</div>
                    <div className="text-xs text-muted-foreground">{getAutoLockLabel(autoLock)}</div>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </button>
            )}
          </Card>
        </div>

        <div className="space-y-2">
          <h2 className="text-xs font-mono font-semibold uppercase tracking-widest text-muted-foreground px-2">
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
                  <div className="font-label text-foreground">Theme</div>
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
                  <div className="font-label text-foreground">Display Currency</div>
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
                  <h3 className="font-label text-foreground">{currency} vs USD</h3>
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
          <h2 className="text-xs font-mono font-semibold uppercase tracking-widest text-muted-foreground px-2">
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
                <span className="font-label text-foreground">Context</span>
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
                <span className="font-label text-foreground">How It Works</span>
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
                <span className="font-label text-foreground">FAQs</span>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
          </Card>
        </div>

        <div className="space-y-2">
          <h2 className="text-xs font-mono font-semibold uppercase tracking-widest text-muted-foreground px-2">
            Network
          </h2>
          <Card className="divide-y">
            <a
              href="https://nanopaystrellar.replit.app"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-between p-4 hover-elevate"
              data-testid="button-switch-stellar"
            >
              <div className="flex items-center gap-3">
                <svg className="h-5 w-5 text-muted-foreground" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12.283 1.851A10.154 10.154 0 001.846 12.002c0 .259.01.516.03.773A1.847 1.847 0 01.872 14.56L0 15.005v2.074l2.568-1.309.832-.424.855-.436 16.912-8.627.833-.425V3.784l-4.868 2.483A10.123 10.123 0 0012.283 1.85zM21.126 6.92l-.832.424-.855.436-16.912 8.627-.833.425v2.074l4.868-2.483a10.123 10.123 0 004.849 4.417 10.154 10.154 0 0010.437-10.151c0-.259-.01-.516-.03-.773a1.847 1.847 0 011.004-1.785L24 6.846V4.772z"/>
                </svg>
                <div className="text-left">
                  <div className="font-label text-foreground">Switch to Stellar</div>
                  <div className="text-xs text-muted-foreground">Use Stellar network wallet</div>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </a>
          </Card>
        </div>

        <div className="space-y-2">
          <h2 className="text-xs font-mono font-semibold uppercase tracking-widest text-muted-foreground px-2">
            Troubleshooting
          </h2>
          <Card className="divide-y">
            <button
              onClick={() => setShowResetConfirm(true)}
              className="w-full flex items-center justify-between p-4 hover-elevate"
              data-testid="button-reset-app-data"
            >
              <div className="flex items-center gap-3">
                <RotateCcw className="h-5 w-5 text-muted-foreground" />
                <div className="text-left">
                  <div className="font-label text-foreground">Reset App Data</div>
                  <div className="text-xs text-muted-foreground">Clear cache if app isn't working</div>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
          </Card>
        </div>

        <div className="pt-4">
          <button
            onClick={() => {
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
                    <div className="font-mono text-xs break-all bg-muted p-3 border" data-testid="text-exported-private-key">
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
                        <Check className="h-4 w-4" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        Copy Private Key
                      </>
                    )}
                  </Button>
                </div>
              </div>
              
              <div className="pt-2 space-y-2 text-xs text-muted-foreground bg-destructive/10 p-3 border border-destructive/20">
                <p className="font-medium text-destructive">Security Warning</p>
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
                <SelectItem value="UGX">UGX - Ugandan Shilling</SelectItem>
                <SelectItem value="TZS">TZS - Tanzanian Shilling</SelectItem>
                <SelectItem value="ETB">ETB - Ethiopian Birr</SelectItem>
                <SelectItem value="INR">INR - Indian Rupee</SelectItem>
                <SelectItem value="CAD">CAD - Canadian Dollar</SelectItem>
                <SelectItem value="AUD">AUD - Australian Dollar</SelectItem>
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

      <Dialog open={showAutoLock} onOpenChange={setShowAutoLock}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Auto-Lock Timer</DialogTitle>
            <DialogDescription>
              Lock wallet after a period of inactivity.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={autoLock.toString()} onValueChange={(v) => handleAutoLockChange(parseInt(v))}>
              <SelectTrigger data-testid="select-auto-lock">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">When tab closes</SelectItem>
                <SelectItem value="5">5 minutes</SelectItem>
                <SelectItem value="15">15 minutes</SelectItem>
                <SelectItem value="30">30 minutes</SelectItem>
                <SelectItem value="60">1 hour</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Reset App Data
            </DialogTitle>
            <DialogDescription>
              This will clear all cached data including your saved preferences. Your wallet and funds are safe - you'll just need to unlock again.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <div className="text-sm text-muted-foreground bg-muted/50 p-3">
              <p className="font-medium mb-2">This will clear:</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>App cache and stored data</li>
                <li>Saved preferences (theme, currency)</li>
                <li>Cached balances and transactions</li>
              </ul>
            </div>
            <div className="text-sm text-muted-foreground bg-success/10 p-3 border border-success/20">
              <p className="font-medium text-success mb-1">Your wallet is safe</p>
              <p className="text-xs">Your encrypted wallet stays on your device. You'll need your password to unlock it again.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetConfirm(false)} disabled={isResetting} data-testid="button-cancel-reset">
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleResetAppData} 
              disabled={isResetting}
              data-testid="button-confirm-reset"
            >
              {isResetting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Resetting...
                </>
              ) : (
                'Reset App Data'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPasskeyDialog} onOpenChange={setShowPasskeyDialog}>
        <DialogContent>
          <DialogHeader className="text-center">
            <div className={`mx-auto w-12 h-12 flex items-center justify-center mb-2 ${passkeySupportStatus?.supported ? 'bg-[#0055FF]/10' : 'bg-muted'}`}>
              <Fingerprint className={`h-6 w-6 ${passkeySupportStatus?.supported ? 'text-primary' : 'text-muted-foreground'}`} />
            </div>
            <DialogTitle>
              {!passkeySupportStatus?.supported 
                ? 'Not Available'
                : passkeyEnrolled 
                  ? 'Passkey Enabled' 
                  : 'Enable Passkey'}
            </DialogTitle>
            <DialogDescription>
              {!passkeySupportStatus?.supported
                ? 'Requires specific browser support'
                : passkeyEnrolled 
                  ? 'Unlock with Face ID or fingerprint' 
                  : 'Use biometrics instead of recovery code'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3">
            {!passkeySupportStatus?.supported ? (
              <>
                <div className="flex items-start gap-2 text-xs text-muted-foreground p-3 bg-destructive/10 border border-destructive/20">
                  <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-destructive mb-1">
                      {passkeySupportStatus?.reason === 'no_prf' 
                        ? 'Browser lacks PRF'
                        : passkeySupportStatus?.reason === 'no_platform_authenticator'
                          ? 'No biometric available'
                          : 'WebAuthn not supported'}
                    </p>
                    <p>
                      {passkeySupportStatus?.reason === 'no_prf' 
                        ? 'Safari/iOS and some browsers don\'t support this yet.'
                        : passkeySupportStatus?.reason === 'no_platform_authenticator'
                          ? 'No Face ID, Touch ID, or fingerprint available.'
                          : 'Your browser doesn\'t support WebAuthn.'}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowPasskeyDialog(false)}
                  data-testid="button-close-passkey-dialog"
                >
                  Got it
                </Button>
              </>
            ) : passkeyEnrolled ? (
              <>
                <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 bg-muted">
                  <Check className="h-4 w-4 text-primary flex-shrink-0" />
                  <span>Passkey active on this device</span>
                </div>
                <Button
                  variant="outline"
                  className="w-full text-destructive hover:text-destructive"
                  onClick={handleRemovePasskey}
                  disabled={isRemovingPasskey}
                  data-testid="button-remove-passkey"
                >
                  {isRemovingPasskey ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Removing...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4" />
                      Remove Passkey
                    </>
                  )}
                </Button>
              </>
            ) : (
              <>
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Check className="h-3 w-3 text-primary flex-shrink-0" />
                    <span>Instant unlock with biometrics</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="h-3 w-3 text-primary flex-shrink-0" />
                    <span>Recovery code still works</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="h-3 w-3 text-primary flex-shrink-0" />
                    <span>Stored securely on device</span>
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={handleEnrollPasskey}
                  disabled={isEnrollingPasskey}
                  data-testid="button-enable-passkey"
                >
                  {isEnrollingPasskey ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Setting up...
                    </>
                  ) : (
                    <>
                      <Fingerprint className="h-4 w-4" />
                      Enable Passkey
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showRecoveryPhrase} onOpenChange={handleCloseRecoveryPhraseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recovery Phrase</DialogTitle>
            <DialogDescription>
              {!recoveryPhrase ? (
                "Enter your recovery code to view your 12-word phrase"
              ) : (
                "Your recovery phrase gives full access to your wallet. Never share it with anyone."
              )}
            </DialogDescription>
          </DialogHeader>
          
          {!recoveryPhrase ? (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="recovery-phrase-password">Recovery Code</Label>
                <div className="relative">
                  <Input
                    id="recovery-phrase-password"
                    type={showRecoveryPhrasePassword ? 'text' : 'password'}
                    placeholder="Enter your recovery code"
                    value={recoveryPhrasePassword}
                    onChange={(e) => setRecoveryPhrasePassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleViewRecoveryPhrase()}
                    data-testid="input-recovery-phrase-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRecoveryPhrasePassword(!showRecoveryPhrasePassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    data-testid="button-toggle-recovery-phrase-password"
                  >
                    {showRecoveryPhrasePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button onClick={handleViewRecoveryPhrase} className="w-full" data-testid="button-reveal-phrase">
                <Eye className="h-4 w-4" />
                View Recovery Phrase
              </Button>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Your 12-Word Recovery Phrase</Label>
                <div className="space-y-2">
                  <div className="relative">
                    {showRecoveryPhraseWords ? (
                      <div className="grid grid-cols-3 gap-2 bg-muted p-3 border" data-testid="text-recovery-phrase">
                        {recoveryPhrase.split(' ').map((word, index) => (
                          <div key={index} className="font-mono text-xs">
                            <span className="text-muted-foreground">{index + 1}.</span> {word}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="font-mono text-xs break-all bg-muted p-3 border" data-testid="text-recovery-phrase-hidden">
                        {'••••••••  '.repeat(12).trim()}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowRecoveryPhraseWords(!showRecoveryPhraseWords)}
                      className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                      data-testid="button-toggle-phrase-visibility"
                    >
                      {showRecoveryPhraseWords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleCopyRecoveryPhrase}
                    data-testid="button-copy-recovery-phrase"
                  >
                    {copiedPhrase ? (
                      <>
                        <Check className="h-4 w-4" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        Copy Recovery Phrase
                      </>
                    )}
                  </Button>
                </div>
              </div>
              
              <div className="pt-2 space-y-2 text-xs text-muted-foreground bg-destructive/10 p-3 border border-destructive/20">
                <p className="font-medium text-destructive">Security Warning</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>Anyone with these words can access your funds</li>
                  <li>Never share them with anyone</li>
                  <li>Store them in a secure location</li>
                </ul>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseRecoveryPhraseDialog} data-testid="button-close-recovery-phrase">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
