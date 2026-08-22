import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { AppState, Platform } from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { useAppServices } from "@/services/app-service-provider";
import type {
  AuthCredentials,
  AuthSession,
  AuthSignUpResult,
} from "@/services/app-services";
import { toContractError } from "@/services/service-error";

interface AuthSessionContextValue {
  isRestoring: boolean;
  restoreError: string | null;
  retryRestore(): void;
  session: AuthSession | null;
  signIn(credentials: AuthCredentials): Promise<AuthSession>;
  signOut(): Promise<void>;
  signUp(credentials: AuthCredentials): Promise<AuthSignUpResult>;
}

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

export function AuthSessionProvider({ children }: PropsWithChildren) {
  const { auth } = useAppServices();
  const queryClient = useQueryClient();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const previousUserId = useRef<string | null>(null);

  useEffect(() => {
    const userId = session?.user.id ?? null;
    if (previousUserId.current !== userId) queryClient.clear();
    previousUserId.current = userId;
  }, [queryClient, session?.user.id]);

  useEffect(() => {
    let active = true;
    let receivedSessionEvent = false;
    setIsRestoring(true);
    setRestoreError(null);

    const unsubscribe = auth.onSessionChange((nextSession) => {
      if (!active) return;
      receivedSessionEvent = true;
      setSession(nextSession);
      setRestoreError(null);
      setIsRestoring(false);
    });

    void auth
      .getSession()
      .then((restoredSession) => {
        if (active && !receivedSessionEvent) setSession(restoredSession);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setSession(null);
        setRestoreError(
          toContractError(error, {
            code: "unauthenticated",
            message: "无法恢复登录状态，请检查网络后重试。",
            retryable: true,
          }).message,
        );
      })
      .finally(() => {
        if (active) setIsRestoring(false);
      });

    const appStateSubscription =
      Platform.OS === "web"
        ? null
        : AppState.addEventListener("change", (state) => {
            if (state === "active") auth.startAutoRefresh();
            else auth.stopAutoRefresh();
          });
    if (Platform.OS !== "web" && AppState.currentState === "active") {
      auth.startAutoRefresh();
    }

    return () => {
      active = false;
      unsubscribe();
      appStateSubscription?.remove();
      if (Platform.OS !== "web") auth.stopAutoRefresh();
    };
  }, [auth, restoreAttempt]);

  const signIn = async (credentials: AuthCredentials) => {
    const nextSession = await auth.signInWithPassword(credentials);
    setSession(nextSession);
    setRestoreError(null);
    return nextSession;
  };
  const signOut = async () => {
    await auth.signOut();
    setSession(null);
    setRestoreError(null);
  };
  const signUp = async (credentials: AuthCredentials) => {
    const result = await auth.signUpWithPassword(credentials);
    if (result.session) setSession(result.session);
    setRestoreError(null);
    return result;
  };

  return (
    <AuthSessionContext.Provider
      value={{
        isRestoring,
        restoreError,
        retryRestore: () => setRestoreAttempt((attempt) => attempt + 1),
        session,
        signIn,
        signOut,
        signUp,
      }}
    >
      {children}
    </AuthSessionContext.Provider>
  );
}

export function useAuthSession() {
  const context = useContext(AuthSessionContext);
  if (!context) {
    throw new Error("AuthSessionProvider is missing from the component tree");
  }
  return context;
}
