import type {
  ConfirmExtractionInput,
  GetExtractionInput,
  MarkUploadedInput,
  PrepareUploadInput,
  RequestExtractionInput,
} from "@clientflow/contracts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { ConfiguredStubAIProvider } from "./ai-provider.ts";
import { SupabaseAuthSessionAdapter } from "./auth.ts";
import { BackendError } from "./errors.ts";
import type { BackendFacade, BackendFactory } from "./handlers.ts";
import { SupabaseIntakeService } from "./intake-service.ts";
import { SupabaseAIExtractionRepository } from "./repositories.ts";
import {
  PrivateStorageUploadAdapter,
  SupabaseUploadRepository,
} from "./storage.ts";

export type EnvironmentReader = (name: string) => string | undefined;

export function createRuntimeBackendFactory(
  getEnvironment: EnvironmentReader,
): BackendFactory {
  const supabaseUrl = requireEnvironment(getEnvironment, "SUPABASE_URL");
  const publicKey = readApiKey(
    getEnvironment,
    ["SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY"],
    "SUPABASE_PUBLISHABLE_KEYS",
    "Supabase publishable key",
  );
  const serviceRoleKey = readApiKey(
    getEnvironment,
    ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"],
    "SUPABASE_SECRET_KEYS",
    "Supabase server secret key",
  );
  const admin = createClient(supabaseUrl, serviceRoleKey, clientOptions());
  const auth = new SupabaseAuthSessionAdapter((accessToken) =>
    createClient(supabaseUrl, publicKey, {
      ...clientOptions(),
      global: { headers: { authorization: `Bearer ${accessToken}` } },
    }),
  );
  const provider = new ConfiguredStubAIProvider(
    getEnvironment("AI_PROVIDER_STUB_RESULT_JSON"),
  );

  return async (request) => {
    const session = await auth.requireSession(request);
    return createFacade(admin, session.client, session.userId, provider);
  };
}

function createFacade(
  admin: SupabaseClient,
  authenticatedClient: SupabaseClient,
  userId: string,
  provider: ConfiguredStubAIProvider,
): BackendFacade {
  const storage = new PrivateStorageUploadAdapter(admin);
  const uploads = new SupabaseUploadRepository(admin, storage, userId);
  const extractions = new SupabaseAIExtractionRepository(admin, userId);
  const intake = new SupabaseIntakeService(
    authenticatedClient,
    uploads,
    extractions,
    provider,
  );

  return {
    confirmExtraction: (input: ConfirmExtractionInput) => intake.confirm(input),
    getExtraction: (input: GetExtractionInput) =>
      intake.getExtraction(input.extractionId),
    markUploaded: (input: MarkUploadedInput) =>
      uploads.markUploaded(input.uploadId),
    prepareUpload: (input: PrepareUploadInput) => uploads.prepare(input),
    requestExtraction: (input: RequestExtractionInput) =>
      intake.requestExtraction(input.uploadId),
  };
}

function clientOptions() {
  return {
    auth: { autoRefreshToken: false, persistSession: false },
  } as const;
}

function requireEnvironment(
  getEnvironment: EnvironmentReader,
  name: string,
): string {
  const value = getEnvironment(name);
  if (value === undefined || value.trim() === "") {
    throw new BackendError({
      code: "internal_error",
      message: `Missing server environment variable: ${name}`,
      status: 500,
    });
  }
  return value;
}

function readApiKey(
  getEnvironment: EnvironmentReader,
  directNames: string[],
  keyMapName: string,
  label: string,
): string {
  for (const name of directNames) {
    const value = getEnvironment(name);
    if (value !== undefined && value.trim() !== "") {
      return value;
    }
  }

  const keyMapJson = getEnvironment(keyMapName);
  if (keyMapJson !== undefined && keyMapJson.trim() !== "") {
    try {
      const keyMap = JSON.parse(keyMapJson) as unknown;
      if (typeof keyMap === "object" && keyMap !== null && "default" in keyMap) {
        const defaultKey = keyMap.default;
        if (typeof defaultKey === "string" && defaultKey.trim() !== "") {
          return defaultKey;
        }
      }
    } catch {
      // Report one stable configuration error below without exposing key data.
    }
  }

  throw new BackendError({
    code: "internal_error",
    message: `Missing server configuration: ${label}`,
    status: 500,
  });
}
