import type { Session } from "@supabase/supabase-js";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

import { initAuth, onAuthChange } from "../lib/supabase";

export type AuthStatus = "loading" | "signedIn" | "signedOut";

interface AuthState {
  status: AuthStatus;
  session: Session | null;
}

const AuthContext = createContext<AuthState>({ status: "loading", session: null });

/** Boots initAuth() once and tracks Supabase session changes. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading", session: null });

  useEffect(() => {
    let mounted = true;
    initAuth()
      .then((session) => {
        if (mounted) {
          setState({ status: session ? "signedIn" : "signedOut", session });
        }
      })
      .catch(() => {
        if (mounted) setState({ status: "signedOut", session: null });
      });
    const off = onAuthChange((session) => {
      setState({ status: session ? "signedIn" : "signedOut", session });
    });
    return () => {
      mounted = false;
      off();
    };
  }, []);

  const value = useMemo(() => state, [state]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
