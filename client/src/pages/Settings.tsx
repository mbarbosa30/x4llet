import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ChevronRight, Download, Upload, Globe, DollarSign, Key, Copy, Check, Eye, EyeOff, Smartphone } from 'lucide-react';
import { Card } from '@/components/ui/card';
import Footer from '@/components/Footer';
import { getPreferences, savePreferences, exportWalletBackup, getPrivateKey } from '@/lib/wallet';
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

export default function Settings() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [currency, setCurrency] = useState('USD');
  const [language, setLanguage] = useState('en');
  const [network, setNetwork] = useState<'base' | 'celo'>('base');
  const [showExport, setShowExport] = useState(false);
  const [showExportPrivateKey, setShowExportPrivateKey] = useState(false);
  const [showCurrency, setShowCurrency] = useState(false);
  const [showNetwork, setShowNetwork] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [password, setPassword] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const prefs = await getPreferences();
        setCurrency(prefs.currency);
        setLanguage(prefs.language);
        setNetwork(prefs.network);
      } catch (error) {
        console.error('Failed to load preferences:', error);
      }
    };
    loadPreferences();

    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    if ((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || 
        (window.navigator as any).standalone) {
      setIsInstallable(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleExportBackup = async () => {
    if (!recoveryCode || recoveryCode.length < 12) {
      toast({
        title: "Invalid Recovery Code",
        description: "Please enter your recovery code",
        variant: "destructive",
      });
      return;
    }

    try {
      const backup = await exportWalletBackup(recoveryCode);
      
      const blob = new Blob([backup], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'wallet-backup.txt';
      a.click();
      URL.revokeObjectURL(url);
      
      toast({
        title: "Backup Exported!",
        description: "Your encrypted backup has been downloaded",
      });
      
      setShowExport(false);
      setRecoveryCode('');
    } catch (error) {
      console.error('Export failed:', error);
      toast({
        title: "Export Failed",
        description: "Failed to export backup",
        variant: "destructive",
      });
    }
  };

  const handleRestoreBackup = () => {
    setLocation('/restore');
  };

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

  const handleInstallApp = async () => {
    if (!deferredPrompt) {
      toast({
        title: "Already Installed",
        description: "The app is already installed or your browser doesn't support installation",
      });
      return;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      toast({
        title: "App Installed!",
        description: "x4llet has been added to your home screen",
      });
      setIsInstallable(false);
    }
    
    setDeferredPrompt(null);
  };

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
        <h1 className="text-lg font-semibold ml-2">Settings</h1>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-8">
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
              onClick={() => setShowExport(true)}
              className="w-full flex items-center justify-between p-4 hover-elevate"
              data-testid="button-export-backup"
            >
              <div className="flex items-center gap-3">
                <Download className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium">Export Backup</span>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
            <button
              onClick={handleRestoreBackup}
              className="w-full flex items-center justify-between p-4 hover-elevate"
              data-testid="button-restore-backup"
            >
              <div className="flex items-center gap-3">
                <Upload className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium">Restore from Code</span>
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
            {isInstallable && (
              <button
                onClick={handleInstallApp}
                className="w-full flex items-center justify-between p-4 hover-elevate"
                data-testid="button-install-app"
              >
                <div className="flex items-center gap-3">
                  <Smartphone className="h-5 w-5 text-muted-foreground" />
                  <div className="text-left">
                    <div className="text-sm font-medium">Install App</div>
                    <div className="text-xs text-muted-foreground">Add to home screen</div>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </button>
            )}
          </Card>
        </div>

        <div className="pt-4">
          <div className="text-center text-xs text-muted-foreground">
            Version 1.0.0
          </div>
        </div>
      </main>

      <Footer />

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

      <Dialog open={showExport} onOpenChange={setShowExport}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Backup</DialogTitle>
            <DialogDescription>
              Enter your recovery code to encrypt and export your wallet backup
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="recovery-code">Recovery Code</Label>
              <Input
                id="recovery-code"
                type="text"
                placeholder="XXXX-XXXX-XXXX"
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value)}
                className="font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExport(false)}>
              Cancel
            </Button>
            <Button onClick={handleExportBackup}>Export</Button>
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
    </div>
  );
}
