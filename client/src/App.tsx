import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
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

function Router() {
  return (
    <Switch>
      <Route path="/" component={CreateWallet} />
      <Route path="/unlock" component={Unlock} />
      <Route path="/restore" component={RestoreWallet} />
      <Route path="/home" component={Home} />
      <Route path="/send" component={Send} />
      <Route path="/receive" component={Receive} />
      <Route path="/pay" component={Pay} />
      <Route path="/settings" component={Settings} />
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
