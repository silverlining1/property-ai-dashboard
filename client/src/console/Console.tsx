import { useEffect } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Redirect, Route, Router, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import AcceptInvite from "./AcceptInvite";
import Account from "./Account";
import Approvals from "./Approvals";
import Connectors from "./Connectors";
import Conversations from "./Conversations";
import { useEmailLink } from "./emailLinks";
import Knowledge from "./Knowledge";
import Layout from "./Layout";
import Login from "./Login";
import ResetPassword from "./ResetPassword";
import { SessionProvider, useSession } from "./session";
import Settings from "./Settings";
import Team from "./Team";
import WorkOrders from "./WorkOrders";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: true } },
});

/** Drop cached tenant data whenever nobody is signed in, so the next person on this browser never sees it. */
function ClearCacheOnSignOut() {
  const qc = useQueryClient();
  const { state } = useSession();
  useEffect(() => {
    if (state.status === "signed-out") qc.clear();
  }, [state.status, qc]);
  return null;
}

function Routes() {
  const { state } = useSession();
  // Links from invitation and password-reset emails work whether or not someone is signed in.
  const link = useEmailLink();
  if (link?.page === "accept-invite") return <AcceptInvite key={link.token} token={link.token} />;
  if (link?.page === "reset-password") return <ResetPassword key={link.token} token={link.token} />;
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
        <Route path="/work-orders" component={WorkOrders} />
        <Route path="/knowledge" component={Knowledge} />
        <Route path="/connectors" component={Connectors} />
        <Route path="/team" component={Team} />
        <Route path="/settings" component={Settings} />
        <Route path="/account" component={Account} />
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
        <ClearCacheOnSignOut />
        <Router hook={useHashLocation}>
          <Routes />
        </Router>
      </SessionProvider>
    </QueryClientProvider>
  );
}
