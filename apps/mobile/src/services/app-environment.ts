import { AppServiceError } from "@/services/service-error";

export type AppEnvironment =
  | { adapter: "mock" }
  | {
      adapter: "supabase";
      supabasePublishableKey: string;
      supabaseUrl: string;
    };

export interface PublicEnvironmentSource {
  appAdapter?: string;
  supabasePublishableKey?: string;
  supabaseUrl?: string;
}

const EXPO_PUBLIC_ENVIRONMENT: PublicEnvironmentSource = {
  appAdapter: process.env.EXPO_PUBLIC_APP_ADAPTER,
  supabasePublishableKey:
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
};

export function readAppEnvironment(
  source: PublicEnvironmentSource = EXPO_PUBLIC_ENVIRONMENT,
): AppEnvironment {
  const adapter = source.appAdapter?.trim() || "mock";
  if (adapter === "mock") return { adapter };
  if (adapter !== "supabase") {
    throw configurationError(
      "EXPO_PUBLIC_APP_ADAPTER",
      "Expected mock or supabase",
    );
  }

  const supabaseUrl = requireValue(
    source.supabaseUrl,
    "EXPO_PUBLIC_SUPABASE_URL",
  );
  const supabasePublishableKey = requireValue(
    source.supabasePublishableKey,
    "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  );
  if (supabasePublishableKey.startsWith("sb_secret_")) {
    throw configurationError(
      "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "Secret keys are forbidden in the mobile client",
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(supabaseUrl);
  } catch {
    throw configurationError(
      "EXPO_PUBLIC_SUPABASE_URL",
      "Expected an absolute HTTP(S) URL",
    );
  }
  const isLoopback = ["127.0.0.1", "::1", "localhost"].includes(
    parsedUrl.hostname,
  );
  if (parsedUrl.protocol !== "https:" && !(parsedUrl.protocol === "http:" && isLoopback)) {
    throw configurationError(
      "EXPO_PUBLIC_SUPABASE_URL",
      "Expected HTTPS or an HTTP loopback URL",
    );
  }

  return {
    adapter,
    supabasePublishableKey,
    supabaseUrl: parsedUrl.toString().replace(/\/$/, ""),
  };
}

function requireValue(value: string | undefined, variable: string) {
  if (!value?.trim()) {
    throw configurationError(variable, "Required when adapter is supabase");
  }
  return value.trim();
}

function configurationError(variable: string, reason: string) {
  return new AppServiceError(
    "internal_error",
    `Invalid public app configuration: ${variable}`,
    false,
    { reason, variable },
  );
}
