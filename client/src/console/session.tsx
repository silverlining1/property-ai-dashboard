import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
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
  // Bumped by signedIn(): the mount-time session restore must not overwrite a sign-in that started later.
  const generation = useRef(0);

  const loadMe = useCallback(async (gen: number) => {
    try {
      const me = await api<Me>("/v1/me");
      if (gen === generation.current) setState({ status: "signed-in", me });
    } catch {
      if (gen === generation.current) setState({ status: "signed-out" });
    }
  }, []);

  useEffect(() => {
    const gen = generation.current;
    refreshSession().then((ok) => {
      if (gen !== generation.current) return;
      if (ok) void loadMe(gen);
      else setState({ status: "signed-out" });
    });
    return onSessionChange((signedIn) => {
      if (!signedIn) setState({ status: "signed-out" });
    });
  }, [loadMe]);

  // After a successful sign-in, a failed profile load is reported to the form, not treated as a sign-out.
  const signedIn = useCallback(async () => {
    generation.current += 1;
    // Accepting an invitation can switch accounts without passing through signed-out: drop the old
    // account's cache before anything else, and don't keep its identity if the new profile fails to load.
    qc.clear();
    let me: Me;
    try {
      me = await api<Me>("/v1/me");
    } catch (err) {
      // Never leave a previous identity, or a "loading" state whose restore this call superseded.
      setState({ status: "signed-out" });
      throw err;
    }
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
