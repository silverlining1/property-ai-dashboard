import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, logout as apiLogout, onSessionChange, refreshSession, type Me } from "./api";

type SessionState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; me: Me };

interface SessionValue {
  state: SessionState;
  /** Call after login/signup succeeds; loads the profile and throws if that fails. */
  signedIn: () => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [state, setState] = useState<SessionState>({ status: "loading" });

  const loadMe = useCallback(async () => {
    try {
      setState({ status: "signed-in", me: await api<Me>("/v1/me") });
    } catch {
      setState({ status: "signed-out" });
    }
  }, []);

  useEffect(() => {
    refreshSession().then((ok) => (ok ? loadMe() : setState({ status: "signed-out" })));
    return onSessionChange((signedIn) => {
      if (!signedIn) setState({ status: "signed-out" });
    });
  }, [loadMe]);

  // After a successful sign-in, a failed profile load is reported to the form, not treated as a sign-out.
  const signedIn = useCallback(async () => {
    const me = await api<Me>("/v1/me");
    // Accepting an invitation can switch accounts without passing through signed-out: drop the old cache.
    qc.clear();
    setState({ status: "signed-in", me });
  }, [qc]);

  const logout = useCallback(async () => {
    await apiLogout();
    setState({ status: "signed-out" });
  }, []);

  return <SessionContext.Provider value={{ state, signedIn, logout }}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}

export function useMe(): Me {
  const { state } = useSession();
  if (state.status !== "signed-in") throw new Error("useMe requires a signed-in session");
  return state.me;
}
