import { useState, useEffect, Component, type ReactNode, lazy, Suspense } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertTriangle, RotateCcw, Loader2 } from "lucide-react";
import { useWalletStore } from "@/lib/walletStore";
import { tryRestoreSession, setAutoLockMinutes, getPreferences } from "@/lib/wallet";
import Unlock from "@/pages/Unlock";
import Home from "@/pages/Home";
import Send from "@/pages/Send";
import Receive from "@/pages/Receive";
import Pay from "@/pages/Pay";
import Settings from "@/pages/Settings";
import Claim from "@/pages/Claim";
import MaxFlow from "@/pages/MaxFlow";
import Earn from "@/pages/Earn";
import NotFound from "@/pages/not-found";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";

// Lazy-loaded pages (not in main bundle - loaded on demand)
// Onboarding pages - only needed once
const Landing = lazy(() => import("@/pages/Landing"));
const CreateWallet = lazy(() => import("@/pages/CreateWallet"));
const RestoreWallet = lazy(() => import("@/pages/RestoreWallet"));
// Secondary features
const Pool = lazy(() => import("@/pages/Pool"));
// Public/admin pages
const Admin = lazy(() => import("@/pages/Admin"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const HowItWorks = lazy(() => import("@/pages/HowItWorks"));
const Faqs = lazy(() => import("@/pages/Faqs"));
const Context = lazy(() => import("@/pages/Context"));
const Traction = lazy(() => import("@/pages/Traction"));

// Loading fallback for lazy-loaded pages
function LazyLoadFallback() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

// Emergency reset function - clears all cached data
async function performEmergencyReset() {
  try {
    // Clear React Query cache
    queryClient.clear();
    
    // Unregister all service workers
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(reg => reg.unregister()));
    }
    
    // Clear all caches (Cache API)
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
    }
    
    // Clear IndexedDB databases
    if ('indexedDB' in window) {
      const databases = await indexedDB.databases?.() || [];
      await Promise.all(databases.map(db => {
        if (db.name) {
          return new Promise<void>((resolve) => {
            const req = indexedDB.deleteDatabase(db.name!);
            req.onsuccess = () => resolve();
            req.onerror = () => resolve();
            req.onblocked = () => resolve();
          });
        }
        return Promise.resolve();
      }));
    }
    
    // Clear localStorage and sessionStorage
    localStorage.clear();
    sessionStorage.clear();
    
    // Reload without the reset parameter - use origin to strip all query params
    window.location.href = window.location.origin + '/';
  } catch (error) {
    console.error('Emergency reset failed:', error);
    // Force reload anyway
    window.location.href = '/';
  }
}

// Error Boundary component for catching render errors
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  isResetting: boolean;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, isResetting: false };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }) {
    console.error('App Error:', error, errorInfo);
  }

  handleReset = async () => {
    this.setState({ isResetting: true });
    await performEmergencyReset();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <Card className="max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-destructive">
              <AlertTriangle className="h-8 w-8" />
              <h1 className="text-xl font-bold">Something went wrong</h1>
            </div>
            
            <p className="text-sm text-muted-foreground">
              The app encountered an error and couldn't load properly. This is usually caused by cached data that needs to be cleared.
            </p>
            
            <div className="bg-muted/50 p-3 text-xs text-muted-foreground font-mono overflow-auto max-h-24">
              {this.state.error?.message || 'Unknown error'}
            </div>
            
            <div className="space-y-2">
              <Button 
                onClick={this.handleReset} 
                disabled={this.state.isResetting}
                className="w-full"
                data-testid="button-error-reset"
              >
                {this.state.isResetting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Resetting...
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-4 w-4" />
                    Reset App Data
                  </>
                )}
              </Button>
              
              <p className="text-xs text-muted-foreground text-center">
                Your wallet is safe. You'll just need to unlock it again.
              </p>
            </div>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

function Router() {
  return (
    <Switch>
      <Route path="/">
        <Suspense fallback={<LazyLoadFallback />}>
          <Landing />
        </Suspense>
      </Route>
      <Route path="/create">
        <Suspense fallback={<LazyLoadFallback />}>
          <CreateWallet />
        </Suspense>
      </Route>
      <Route path="/unlock" component={Unlock} />
      <Route path="/restore">
        <Suspense fallback={<LazyLoadFallback />}>
          <RestoreWallet />
        </Suspense>
      </Route>
      <Route path="/home">
        <ProtectedRoute>
          <Home />
        </ProtectedRoute>
      </Route>
      <Route path="/send">
        <ProtectedRoute>
          <Send />
        </ProtectedRoute>
      </Route>
      <Route path="/receive">
        <ProtectedRoute>
          <Receive />
        </ProtectedRoute>
      </Route>
      <Route path="/pay" component={Pay} />
      <Route path="/settings">
        <ProtectedRoute>
          <Settings />
        </ProtectedRoute>
      </Route>
      <Route path="/claim">
        <ProtectedRoute>
          <Claim />
        </ProtectedRoute>
      </Route>
      <Route path="/maxflow">
        <ProtectedRoute>
          <MaxFlow />
        </ProtectedRoute>
      </Route>
      <Route path="/earn">
        <ProtectedRoute>
          <Earn />
        </ProtectedRoute>
      </Route>
      <Route path="/pool">
        <ProtectedRoute>
          <Suspense fallback={<LazyLoadFallback />}>
            <Pool />
          </Suspense>
        </ProtectedRoute>
      </Route>
      <Route path="/admin">
        <Suspense fallback={<LazyLoadFallback />}>
          <Admin />
        </Suspense>
      </Route>
      <Route path="/dashboard">
        <Suspense fallback={<LazyLoadFallback />}>
          <Dashboard />
        </Suspense>
      </Route>
      <Route path="/how-it-works">
        <Suspense fallback={<LazyLoadFallback />}>
          <HowItWorks />
        </Suspense>
      </Route>
      <Route path="/faqs">
        <Suspense fallback={<LazyLoadFallback />}>
          <Faqs />
        </Suspense>
      </Route>
      <Route path="/context">
        <Suspense fallback={<LazyLoadFallback />}>
          <Context />
        </Suspense>
      </Route>
      <Route path="/traction">
        <Suspense fallback={<LazyLoadFallback />}>
          <Traction />
        </Suspense>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [location] = useLocation();
  const [isEmergencyResetting, setIsEmergencyResetting] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const { isUnlocked } = useWalletStore();

  // Try to restore session on app load
  useEffect(() => {
    async function restoreSession() {
      try {
        // Load auto-lock preference
        const prefs = await getPreferences();
        if (prefs.autoLockMinutes !== undefined) {
          setAutoLockMinutes(prefs.autoLockMinutes);
        }
        
        // Try to restore session from sessionStorage (synchronous)
        const restored = tryRestoreSession();
        if (restored) {
          console.log('[App] Session restored successfully');
        }
      } catch (error) {
        console.error('[App] Failed to restore session:', error);
      } finally {
        setIsRestoringSession(false);
      }
    }
    restoreSession();
  }, []);

  // Check for emergency reset URL parameter (?reset=1)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('reset') === '1') {
      setIsEmergencyResetting(true);
      performEmergencyReset();
    }
  }, []);

  // No more beforeunload warning since session persists across refresh

  // Show loading screen during session restore or emergency reset
  if (isRestoringSession) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isEmergencyResetting) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-6 space-y-4 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <h1 className="text-lg font-medium">Resetting app data...</h1>
          <p className="text-sm text-muted-foreground">
            Please wait while we clear the cache. The app will reload automatically.
          </p>
        </Card>
      </div>
    );
  }

  // Only show header and bottom nav on protected routes
  const protectedRoutes = ['/home', '/send', '/receive', '/settings', '/claim', '/maxflow', '/earn', '/pool'];
  const showLayout = protectedRoutes.includes(location);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        {showLayout && <AppHeader />}
        <Router />
        {showLayout && <BottomNav />}
      </TooltipProvider>
    </QueryClientProvider>
  );
}

// Wrap App with ErrorBoundary for crash recovery
function AppWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

export default AppWithErrorBoundary;
