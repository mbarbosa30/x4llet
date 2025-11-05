import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Landing from "@/pages/Landing";
import CreateWallet from "@/pages/CreateWallet";
import Unlock from "@/pages/Unlock";
import RestoreWallet from "@/pages/RestoreWallet";
import Home from "@/pages/Home";
import Send from "@/pages/Send";
import Receive from "@/pages/Receive";
import Pay from "@/pages/Pay";
import Settings from "@/pages/Settings";
import HowItWorks from "@/pages/HowItWorks";
import Faqs from "@/pages/Faqs";
import NotFound from "@/pages/not-found";
import { ProtectedRoute } from "@/components/ProtectedRoute";

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
      <Route path="/how-it-works" component={HowItWorks} />
      <Route path="/faqs" component={Faqs} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
