import type { SupabaseClient } from "@supabase/supabase-js";

import { BackendError } from "./errors.ts";

export interface AuthenticatedSession {
  accessToken: string;
  client: SupabaseClient;
  userId: string;
}

export class SupabaseAuthSessionAdapter {
  constructor(
    private readonly createAuthenticatedClient: (
      accessToken: string,
    ) => SupabaseClient,
  ) {}

  async requireSession(request: Request): Promise<AuthenticatedSession> {
    const accessToken = parseBearerToken(request.headers.get("authorization"));
    const client = this.createAuthenticatedClient(accessToken);
    const { data, error } = await client.auth.getUser(accessToken);

    if (error !== null || data.user === null) {
      throw new BackendError({
        code: "unauthenticated",
        message: "A valid authenticated session is required",
        status: 401,
        cause: error,
      });
    }

    return { accessToken, client, userId: data.user.id };
  }
}

function parseBearerToken(authorization: string | null): string {
  const match = /^Bearer\s+(\S+)$/i.exec(authorization ?? "");

  if (match?.[1] === undefined) {
    throw new BackendError({
      code: "unauthenticated",
      message: "A valid authenticated session is required",
      status: 401,
    });
  }

  return match[1];
}
