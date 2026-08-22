import type { AuthError, Session, SupabaseClient, User } from "@supabase/supabase-js";

import type {
  AuthCredentials,
  AuthService,
  AuthSession,
  AuthSignUpResult,
  AuthUser,
} from "@/services/app-services";
import { AppServiceError } from "@/services/service-error";

export class SupabaseAuthService implements AuthService {
  constructor(private readonly client: SupabaseClient) {}

  async getSession() {
    const { data, error } = await this.client.auth.getSession();
    throwAuthError(error, {
      code: "unauthenticated",
      message: "无法恢复登录状态，请重新登录。",
      retryable: true,
    });
    return data.session ? mapSession(data.session) : null;
  }

  onSessionChange(listener: (session: AuthSession | null) => void) {
    const { data } = this.client.auth.onAuthStateChange((_event, session) => {
      listener(session ? mapSession(session) : null);
    });
    return () => data.subscription.unsubscribe();
  }

  async signInWithPassword(credentials: AuthCredentials) {
    const { data, error } = await this.client.auth.signInWithPassword({
      email: credentials.email.trim(),
      password: credentials.password,
    });
    throwAuthError(error, {
      code: "unauthenticated",
      message: "邮箱或密码不正确。",
      retryable: false,
    });
    if (!data.session) {
      throw new AppServiceError(
        "unauthenticated",
        "登录响应未包含有效 Session。",
        false,
      );
    }
    return mapSession(data.session);
  }

  async signOut() {
    const { error } = await this.client.auth.signOut();
    throwAuthError(error, {
      code: "internal_error",
      message: "退出登录失败，请重试。",
      retryable: true,
    });
  }

  async signUpWithPassword(
    credentials: AuthCredentials,
  ): Promise<AuthSignUpResult> {
    const { data, error } = await this.client.auth.signUp({
      email: credentials.email.trim(),
      password: credentials.password,
    });
    throwAuthError(error, {
      code: "validation_failed",
      message: "注册失败，请检查邮箱和密码。",
      retryable: false,
    });
    if (!data.user) {
      throw new AppServiceError(
        "internal_error",
        "注册响应未包含用户信息。",
        true,
      );
    }
    return {
      requiresEmailConfirmation: data.session === null,
      session: data.session ? mapSession(data.session) : null,
      user: mapUser(data.user),
    };
  }

  startAutoRefresh() {
    void this.client.auth.startAutoRefresh();
  }

  stopAutoRefresh() {
    void this.client.auth.stopAutoRefresh();
  }
}

interface AuthErrorFallback {
  code: "internal_error" | "unauthenticated" | "validation_failed";
  message: string;
  retryable: boolean;
}

function throwAuthError(error: AuthError | null, fallback: AuthErrorFallback) {
  if (!error) return;

  if (
    error.status === 429 ||
    ["over_email_send_rate_limit", "over_request_rate_limit"].includes(
      error.code ?? "",
    )
  ) {
    throw new AppServiceError(
      "rate_limited",
      "请求过于频繁，请稍后重试。",
      true,
    );
  }
  if (error.code === "invalid_credentials") {
    throw new AppServiceError(
      "unauthenticated",
      "邮箱或密码不正确。",
      false,
    );
  }
  if (["email_exists", "user_already_exists"].includes(error.code ?? "")) {
    throw new AppServiceError(
      "conflict",
      "该邮箱已注册，请直接登录。",
      false,
    );
  }
  if (error.code === "weak_password") {
    throw new AppServiceError(
      "validation_failed",
      "密码强度不足，请使用更安全的密码。",
      false,
    );
  }
  throw new AppServiceError(
    fallback.code,
    fallback.message,
    fallback.retryable,
    error.code ? { providerCode: error.code } : undefined,
  );
}

function mapSession(session: Session): AuthSession {
  return { user: mapUser(session.user) };
}

function mapUser(user: User): AuthUser {
  return { id: user.id, email: user.email ?? null };
}
