import { AppServiceError } from "@/services/service-error";

export type AppEnvironment =
  | { adapter: "mock" }
  | {
      adapter: "supabase";
      supabasePublishableKey: string;
      supabaseUrl: string;
    };

export interface PublicEnvironmentSource {
  aiProvider?: string;
  adminToken?: string;
  appAdapter?: string;
  dashscopeApiKey?: string;
  serviceRoleKey?: string;
  supabaseSecretKey?: string;
  supabasePublishableKey?: string;
  supabaseUrl?: string;
}

export interface AppEnvironmentOptions {
  isDevelopment?: boolean;
}

const EXPO_PUBLIC_ENVIRONMENT: PublicEnvironmentSource = {
  aiProvider: process.env.EXPO_PUBLIC_AI_PROVIDER,
  adminToken: process.env.EXPO_PUBLIC_ADMIN_TOKEN,
  appAdapter: process.env.EXPO_PUBLIC_APP_ADAPTER,
  dashscopeApiKey: process.env.EXPO_PUBLIC_DASHSCOPE_API_KEY,
  serviceRoleKey: process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY,
  supabaseSecretKey: process.env.EXPO_PUBLIC_SUPABASE_SECRET_KEY,
  supabasePublishableKey:
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
};

export function readAppEnvironment(
  source: PublicEnvironmentSource = EXPO_PUBLIC_ENVIRONMENT,
  options: AppEnvironmentOptions = {},
): AppEnvironment {
  rejectForbiddenPublicConfiguration(source);

  const adapter = source.appAdapter?.trim();
  if (!adapter) {
    if (options.isDevelopment) return { adapter: "mock" };
    throw configurationError(
      "EXPO_PUBLIC_APP_ADAPTER",
      "Required for a production build",
    );
  }
  if (adapter === "mock") {
    if (!options.isDevelopment) {
      throw configurationError(
        "EXPO_PUBLIC_APP_ADAPTER",
        "Mock is forbidden in a production build",
      );
    }
    return { adapter };
  }
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
  if (isSecretSupabaseKey(supabasePublishableKey)) {
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

function rejectForbiddenPublicConfiguration(source: PublicEnvironmentSource) {
  const forbiddenValues: Array<[string, string | undefined]> = [
    ["EXPO_PUBLIC_AI_PROVIDER", source.aiProvider],
    ["EXPO_PUBLIC_ADMIN_TOKEN", source.adminToken],
    ["EXPO_PUBLIC_DASHSCOPE_API_KEY", source.dashscopeApiKey],
    ["EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY", source.serviceRoleKey],
    ["EXPO_PUBLIC_SUPABASE_SECRET_KEY", source.supabaseSecretKey],
  ];
  const configured = forbiddenValues.find(([, value]) => value?.trim());
  if (configured) {
    throw configurationError(
      configured[0],
      "Server-only configuration is forbidden in the mobile client",
    );
  }
}

function isSecretSupabaseKey(value: string) {
  if (/^sb_secret_/i.test(value) || /service[_-]?role/i.test(value)) {
    return true;
  }
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(decodeBase64Url(parts[1])) as { role?: unknown };
    return payload.role === "service_role" || payload.role === "supabase_admin";
  } catch {
    return false;
  }
}

function decodeBase64Url(value: string) {
  const unpadded = value.replace(/-/g, "+").replace(/_/g, "/");
  const normalized = unpadded.padEnd(
    unpadded.length + ((4 - (unpadded.length % 4)) % 4),
    "=",
  );
  if (typeof atob === "function") return atob(normalized);

  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let buffer = 0;
  let bits = 0;
  let output = "";
  for (const character of normalized) {
    if (character === "=") break;
    const value = alphabet.indexOf(character);
    if (value < 0) throw new Error("Invalid base64url value.");
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
      buffer &= (1 << bits) - 1;
    }
  }
  return output;
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
