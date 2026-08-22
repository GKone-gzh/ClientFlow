import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { readAppEnvironment } from "../src/services/app-environment";
import { createSupabaseUploadAdapter } from "../src/services/supabase/supabase-upload-adapter";

const SCREENSHOT_BUCKET = "chat-screenshots";

interface StorageSmokeEnvironment {
  CLIENTFLOW_AUTH_TEST_EMAIL?: string;
  CLIENTFLOW_AUTH_TEST_PASSWORD?: string;
  CLIENTFLOW_STORAGE_TEST_IMAGE?: string;
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  EXPO_PUBLIC_SUPABASE_URL?: string;
}

export class StorageSmokeError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "StorageSmokeError";
  }
}

export async function runSupabaseStorageSmoke(source: StorageSmokeEnvironment) {
  const environment = readAppEnvironment({
    appAdapter: "supabase",
    supabasePublishableKey: source.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    supabaseUrl: source.EXPO_PUBLIC_SUPABASE_URL,
  });
  if (environment.adapter !== "supabase") {
    throw new StorageSmokeError("invalid_configuration", "Supabase mode is required.");
  }

  const email = requireValue(source.CLIENTFLOW_AUTH_TEST_EMAIL, "CLIENTFLOW_AUTH_TEST_EMAIL");
  const password = requireValue(
    source.CLIENTFLOW_AUTH_TEST_PASSWORD,
    "CLIENTFLOW_AUTH_TEST_PASSWORD",
  );
  const imagePath = requireValue(
    source.CLIENTFLOW_STORAGE_TEST_IMAGE,
    "CLIENTFLOW_STORAGE_TEST_IMAGE",
  );
  const imageStat = await stat(imagePath);
  if (!imageStat.isFile()) {
    throw new StorageSmokeError("invalid_image", "Storage smoke image must be a file.");
  }
  const mimeType = imageMimeType(imagePath);
  const imageBytes = await readFile(imagePath);
  if (imageBytes.byteLength <= 0 || imageBytes.byteLength > 10 * 1024 * 1024) {
    throw new StorageSmokeError(
      "invalid_image",
      "Storage smoke image must be between 1 byte and 10 MiB.",
    );
  }

  const client = createClient(
    environment.supabaseUrl,
    environment.supabasePublishableKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error || !signIn.data.session || !signIn.data.user) {
    throw new StorageSmokeError(
      "sign_in_failed",
      "The real Supabase test account could not sign in.",
    );
  }

  try {
    const adapter = createSupabaseUploadAdapter(client, {
      readFile: async () =>
        imageBytes.buffer.slice(
          imageBytes.byteOffset,
          imageBytes.byteOffset + imageBytes.byteLength,
        ) as ArrayBuffer,
    });
    const prepared = await adapter.uploads.prepare({
      byteSize: imageBytes.byteLength,
      mimeType,
      originalFileName: basename(imagePath),
    });
    await adapter.screenshotUpload.upload({
      prepared,
      file: {
        byteSize: imageBytes.byteLength,
        mimeType,
        uri: pathToFileURL(imagePath).href,
      },
    });
    const confirmed = await adapter.uploads.markUploaded(prepared.uploadId);
    const stored = await adapter.uploads.getById(prepared.uploadId);

    if (!stored || confirmed.status !== "uploaded" || stored.status !== "uploaded") {
      throw new StorageSmokeError(
        "upload_not_confirmed",
        "The upload record was not confirmed as uploaded.",
      );
    }
    const expectedPath = `${signIn.data.user.id}/${prepared.uploadId}/source`;
    if (
      prepared.storagePath !== expectedPath ||
      stored.storagePath !== expectedPath ||
      stored.userId !== signIn.data.user.id
    ) {
      throw new StorageSmokeError(
        "ownership_mismatch",
        "The upload owner or canonical storage path did not match the session.",
      );
    }

    const publicUrl = client.storage
      .from(SCREENSHOT_BUCKET)
      .getPublicUrl(prepared.storagePath).data.publicUrl;
    const publicResponse = await fetch(publicUrl);
    if (publicResponse.ok) {
      throw new StorageSmokeError(
        "bucket_is_public",
        "The uploaded screenshot was accessible without a signed download URL.",
      );
    }

    return {
      bucket: SCREENSHOT_BUCKET,
      byteSize: imageBytes.byteLength,
      canonicalPath: true,
      ownerMatched: true,
      publicAccessRejected: true,
      status: stored.status,
    } as const;
  } finally {
    await client.auth.signOut({ scope: "local" });
  }
}

export function imageMimeType(filePath: string) {
  const extension = extname(filePath).toLowerCase();
  if ([".jpg", ".jpeg"].includes(extension)) return "image/jpeg" as const;
  if (extension === ".png") return "image/png" as const;
  if (extension === ".webp") return "image/webp" as const;
  throw new StorageSmokeError(
    "unsupported_mime_type",
    "Storage smoke supports JPEG, PNG, or WebP images only.",
  );
}

function requireValue(value: string | undefined, variable: string) {
  if (!value?.trim()) {
    throw new StorageSmokeError(
      "missing_configuration",
      `Missing required smoke environment variable: ${variable}`,
    );
  }
  return value.trim();
}

async function main() {
  try {
    const result = await runSupabaseStorageSmoke({
      CLIENTFLOW_AUTH_TEST_EMAIL: process.env.CLIENTFLOW_AUTH_TEST_EMAIL,
      CLIENTFLOW_AUTH_TEST_PASSWORD: process.env.CLIENTFLOW_AUTH_TEST_PASSWORD,
      CLIENTFLOW_STORAGE_TEST_IMAGE: process.env.CLIENTFLOW_STORAGE_TEST_IMAGE,
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    });
    console.log(
      JSON.stringify({ check: "supabase-private-storage", ...result }),
    );
  } catch (error) {
    const safeError =
      error instanceof StorageSmokeError
        ? error
        : new StorageSmokeError(
            "storage_smoke_failed",
            error instanceof Error
              ? error.message
              : "Unexpected Storage smoke failure.",
          );
    console.error(
      JSON.stringify({
        check: "supabase-private-storage",
        code: safeError.code,
        message: safeError.message,
        status: "failed",
      }),
    );
    process.exitCode = 1;
  }
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryPoint === import.meta.url) void main();
