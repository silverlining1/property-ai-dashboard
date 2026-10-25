import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/not-found";
import Console from "./console/Console";

// /demo is the original simulation (password-gated by the server); everything else is the console,
// which signs in against the PropAI platform API.
const isDemo = window.location.pathname.replace(/\/+$/, "") === "/demo";

function Demo() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router hook={useHashLocation}>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route component={NotFound} />
        </Switch>
      </Router>
      <Toaster />
    </QueryClientProvider>
  );
}

export default function App() {
  return isDemo ? <Demo /> : <Console />;
}
