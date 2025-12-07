import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, X, Share } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const isIOSDevice = (/iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream) ||
                        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsIOS(isIOSDevice);

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                        (window.navigator as any).standalone === true;
    setIsInstalled(isStandalone);

    const dismissed = sessionStorage.getItem('install_prompt_dismissed');
    setIsDismissed(dismissed === 'true');

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      toast({
        title: "App installed",
      });
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [toast]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;

      if (choiceResult.outcome === 'accepted') {
        setIsInstalled(true);
      }

      setDeferredPrompt(null);
    } catch (error) {
      console.error('Error during installation:', error);
      toast({
        title: "Installation Failed",
        description: "Please try again or use your browser's menu to install",
        variant: "destructive",
      });
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    sessionStorage.setItem('install_prompt_dismissed', 'true');
  };

  if (isInstalled || isDismissed) {
    return null;
  }

  if (isIOS && !deferredPrompt) {
    return (
      <Card data-testid="card-install-ios">
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base">Install nanoPay</CardTitle>
            <CardDescription className="text-sm mt-1">
              Add to your home screen for the best experience
            </CardDescription>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={handleDismiss}
            data-testid="button-dismiss-install-ios"
            aria-label="Dismiss install prompt"
            className="flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3 text-sm">
            <Share className="h-5 w-5 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">Tap the Share button</p>
              <p className="text-muted-foreground text-xs">
                Located at the bottom of Safari
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 text-sm">
            <Download className="h-5 w-5 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">Select "Add to Home Screen"</p>
              <p className="text-muted-foreground text-xs">
                Scroll down in the share menu
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (deferredPrompt) {
    return (
      <Card data-testid="card-install-android">
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base">Install nanoPay</CardTitle>
            <CardDescription className="text-sm mt-1">
              Access offline, faster loading, and native app experience
            </CardDescription>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={handleDismiss}
            data-testid="button-dismiss-install-android"
            aria-label="Dismiss install prompt"
            className="flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <Button
            onClick={handleInstallClick}
            className="w-full"
            data-testid="button-install-app"
          >
            <Download className="h-4 w-4" />
            Install App
          </Button>
        </CardContent>
      </Card>
    );
  }

  return null;
}
