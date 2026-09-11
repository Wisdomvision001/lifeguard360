import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type JSX,
  type ReactNode,
} from "react";

import type { AuthState } from "@/services/auth/authService";
import { observeAuth } from "@/services/auth/authService";

/**
 * AuthProvider (Phase 2): exposes Firebase auth state to the tree.
 * `loading` until the first determination; guests are a normal, first-class
 * state — personalisation features prompt sign-in when used.
 */

const AuthContext = createContext<{ authState: AuthState } | null>(null);

const GUEST_STATE: AuthState = {
  user: null,
  profile: null,
  preferences: null,
  status: "signed-out",
  error: null,
};

export function AuthProvider({
  children,
  observer,
}: {
  children: ReactNode;
  /** Injectable for tests; defaults to the real service. */
  observer?: typeof observeAuth;
}): JSX.Element {
  const [authState, setAuthState] = useState<AuthState>({
    ...GUEST_STATE,
    status: "loading",
  });

  useEffect(() => {
    const subscribe = observer ?? observeAuth;
    return subscribe((next) => setAuthState(next));
  }, [observer]);

  const value = useMemo(() => ({ authState }), [authState]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): { authState: AuthState } {
  const context = useContext(AuthContext);
  if (context === null) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
