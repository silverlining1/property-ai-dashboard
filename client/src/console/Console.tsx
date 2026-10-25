import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Redirect, Route, Router, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import Approvals from "./Approvals";
import Conversations from "./Conversations";
import Layout from "./Layout";
import Login from "./Login";
import { SessionProvider, useSession } from "./session";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: true } },
});

function Routes() {
  const { state } = useSession();
  if (state.status === "loading") {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (state.status === "signed-out") return <Login />;
  return (
    <Layout>
      <Switch>
        <Route path="/approvals" component={Approvals} />
        <Route path="/conversations/:id">{(p) => <Conversations id={p.id} />}</Route>
        <Route path="/conversations">{() => <Conversations />}</Route>
        <Route>
          <Redirect to="/approvals" />
        </Route>
      </Switch>
    </Layout>
  );
}

export default function Console() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <Router hook={useHashLocation}>
          <Routes />
        </Router>
      </SessionProvider>
    </QueryClientProvider>
  );
}
