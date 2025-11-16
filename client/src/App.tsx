import { useState } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RailProvider } from "@/contexts/RailContext";
import Landing from "@/pages/Landing";
import CreateWallet from "@/pages/CreateWallet";
import Unlock from "@/pages/Unlock";
import RestoreWallet from "@/pages/RestoreWallet";
import Home from "@/pages/Home";
import Send from "@/pages/Send";
import Receive from "@/pages/Receive";
import Pay from "@/pages/Pay";
import Settings from "@/pages/Settings";
import Signal from "@/pages/Signal";
import Admin from "@/pages/Admin";
import HowItWorks from "@/pages/HowItWorks";
import Faqs from "@/pages/Faqs";
import Context from "@/pages/Context";
import NotFound from "@/pages/not-found";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import QRScanner from "@/components/QRScanner";
import { useToast } from "@/hooks/use-toast";
import type { PaymentRequest } from "@shared/schema";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/create" component={CreateWallet} />
      <Route path="/unlock" component={Unlock} />
      <Route path="/restore" component={RestoreWallet} />
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
      <Route path="/signal">
        <ProtectedRoute>
          <Signal />
        </ProtectedRoute>
      </Route>
      <Route path="/admin" component={Admin} />
      <Route path="/how-it-works" component={HowItWorks} />
      <Route path="/faqs" component={Faqs} />
      <Route path="/context" component={Context} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [location, setLocation] = useLocation();
  const [showScanner, setShowScanner] = useState(false);
  const { toast } = useToast();

  // Only show header and bottom nav on protected routes
  const protectedRoutes = ['/home', '/send', '/receive', '/settings', '/signal'];
  const showLayout = protectedRoutes.includes(location);

  const handleScanPaymentRequest = (data: string) => {
    try {
      const paymentRequest: PaymentRequest = JSON.parse(data);
      
      if (!paymentRequest.v || !paymentRequest.to || !paymentRequest.amount) {
        throw new Error('Invalid payment request');
      }
      
      setShowScanner(false);
      
      sessionStorage.setItem('payment_request', JSON.stringify(paymentRequest));
      setLocation('/send');
      
    } catch (error) {
      toast({
        title: "Invalid QR Code",
        description: "This doesn't appear to be a valid payment request",
        variant: "destructive",
      });
    }
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RailProvider>
          <Toaster />
          {showLayout && <AppHeader onScanClick={() => setShowScanner(true)} />}
          <Router />
          {showLayout && <BottomNav />}
          {showScanner && (
            <QRScanner
              onScan={handleScanPaymentRequest}
              onClose={() => setShowScanner(false)}
            />
          )}
        </RailProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
