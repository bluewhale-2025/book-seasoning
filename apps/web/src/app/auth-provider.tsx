import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { AuthUser, SignUpInput } from "../data/auth-api";
import { useAppRuntime } from "./app-runtime";

type AuthState =
  | Readonly<{ status: "loading"; user: null }>
  | Readonly<{ status: "anonymous"; user: null }>
  | Readonly<{ status: "authenticated"; user: AuthUser }>;

export type AuthContextValue = AuthState &
  Readonly<{
    signUp(input: SignUpInput): Promise<void>;
    signIn(email: string, password: string): Promise<void>;
    requestPasswordReset(email: string, captchaToken?: string): Promise<void>;
    exchangePasswordResetCode(code: string): Promise<void>;
    updatePassword(password: string): Promise<void>;
    signOut(): Promise<void>;
    completeAccountDeletion(): Promise<void>;
  }>;

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const { auth } = useAppRuntime();
  const queryClient = useQueryClient();
  const [state, setState] = React.useState<AuthState>({ status: "loading", user: null });

  React.useEffect(() => {
    let active = true;
    const unsubscribe = auth.subscribe((user) => {
      if (!active) return;
      setState(
        user === null
          ? { status: "anonymous", user: null }
          : { status: "authenticated", user },
      );
    });

    void auth
      .getCurrentUser()
      .then((user) => {
        if (!active) return;
        setState(
          user === null
            ? { status: "anonymous", user: null }
            : { status: "authenticated", user },
        );
      })
      .catch(() => {
        if (active) setState({ status: "anonymous", user: null });
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [auth]);

  const signUp = React.useCallback(async (input: SignUpInput) => {
    const user = await auth.signUp(input);
    setState({ status: "authenticated", user });
  }, [auth]);
  const signIn = React.useCallback(async (email: string, password: string) => {
    const user = await auth.signIn(email, password);
    setState({ status: "authenticated", user });
  }, [auth]);
  const requestPasswordReset = React.useCallback(async (email: string, captchaToken?: string) => {
    const redirectTo = new URL("/auth/reset", window.location.origin).toString();
    await auth.requestPasswordReset(email, redirectTo, captchaToken);
  }, [auth]);
  const exchangePasswordResetCode = React.useCallback(
    (code: string) => auth.exchangePasswordResetCode(code),
    [auth],
  );
  const updatePassword = React.useCallback(
    (password: string) => auth.updatePassword(password),
    [auth],
  );
  const signOut = React.useCallback(async () => {
    await auth.signOut();
    queryClient.clear();
    setState({ status: "anonymous", user: null });
  }, [auth, queryClient]);
  const completeAccountDeletion = React.useCallback(async () => {
    try {
      await auth.signOut();
    } catch {
      // The Auth identity may already be gone. Local credentials must still be removed.
    } finally {
      queryClient.clear();
      setState({ status: "anonymous", user: null });
    }
  }, [auth, queryClient]);

  const value = React.useMemo<AuthContextValue>(() => ({
    ...state,
    signUp,
    signIn,
    requestPasswordReset,
    exchangePasswordResetCode,
    updatePassword,
    signOut,
    completeAccountDeletion,
  }), [
    exchangePasswordResetCode,
    requestPasswordReset,
    signIn,
    signOut,
    completeAccountDeletion,
    signUp,
    state,
    updatePassword,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = React.useContext(AuthContext);
  if (value === null) throw new Error("AuthProvider is missing");
  return value;
}
