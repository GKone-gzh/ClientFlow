import type {
  AuthCredentials,
  AuthService,
  AuthSession,
  AuthSignUpResult,
} from "@/services/app-services";
import { AppServiceError } from "@/services/service-error";

import { MOCK_USER_ID } from "./mock-data";

export class MockAuthService implements AuthService {
  private readonly listeners = new Set<(session: AuthSession | null) => void>();
  private session: AuthSession | null = null;

  async getSession() {
    return cloneSession(this.session);
  }

  onSessionChange(listener: (session: AuthSession | null) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async signInWithPassword(credentials: AuthCredentials) {
    const session = createSession(credentials);
    this.setSession(session);
    return cloneSession(session)!;
  }

  async signOut() {
    this.setSession(null);
  }

  async signUpWithPassword(
    credentials: AuthCredentials,
  ): Promise<AuthSignUpResult> {
    const session = createSession(credentials);
    this.setSession(session);
    return {
      requiresEmailConfirmation: false,
      session: cloneSession(session),
      user: { ...session.user },
    };
  }

  startAutoRefresh() {}

  stopAutoRefresh() {}

  private setSession(session: AuthSession | null) {
    this.session = cloneSession(session);
    for (const listener of this.listeners) listener(cloneSession(session));
  }
}

function createSession(credentials: AuthCredentials): AuthSession {
  const email = credentials.email.trim().toLowerCase();
  if (!email.includes("@") || credentials.password.length < 6) {
    throw new AppServiceError(
      "validation_failed",
      "请输入有效邮箱和至少 6 位密码。",
      false,
    );
  }
  return { user: { id: MOCK_USER_ID, email } };
}

function cloneSession(session: AuthSession | null) {
  return session ? { user: { ...session.user } } : null;
}
