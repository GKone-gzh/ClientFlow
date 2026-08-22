import {
  MarkUploadedInputSchema,
  PrepareUploadInputSchema,
  PrepareUploadResultSchema,
  UploadSchema,
  type EntityId,
  type PrepareUploadInput,
  type Upload,
  type UploadRepository,
} from "@clientflow/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ScreenshotUploadFile,
  ScreenshotUploadTransport,
} from "@/services/app-services";
import {
  AppServiceError,
  isContractErrorShape,
} from "@/services/service-error";

const SCREENSHOT_BUCKET = "chat-screenshots";

type ScreenshotFileReader = (uri: string) => Promise<ArrayBuffer>;

export interface SupabaseUploadAdapterOptions {
  readFile?: ScreenshotFileReader;
}

export function createSupabaseUploadAdapter(
  client: SupabaseClient,
  options: SupabaseUploadAdapterOptions = {},
): {
  screenshotUpload: ScreenshotUploadTransport;
  uploads: UploadRepository;
} {
  return {
    screenshotUpload: new SupabaseScreenshotUploadTransport(
      client,
      options.readFile,
    ),
    uploads: new SupabaseUploadRepository(client),
  };
}

export class SupabaseUploadRepository implements UploadRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getById(id: EntityId): Promise<Upload | null> {
    await requireSession(this.client);
    const { data, error } = await this.client
      .from("uploads")
      .select(
        "id,user_id,storage_path,mime_type,byte_size,status,error_code,created_at,updated_at",
      )
      .eq("id", id)
      .maybeSingle();
    if (error) {
      throw providerError(
        error,
        "internal_error",
        "无法读取上传记录，请稍后重试。",
      );
    }
    return data === null ? null : parseUploadRow(data);
  }

  async prepare(input: PrepareUploadInput) {
    await requireSession(this.client);
    const parsedInput = PrepareUploadInputSchema.safeParse(input);
    if (!parsedInput.success) throw invalidUploadInput(parsedInput.error.issues);

    const { data, error } = await this.client.functions.invoke(
      "prepare-upload",
      { body: parsedInput.data },
    );
    if (error) {
      throw await functionError(
        error,
        data,
        "upload_failed",
        "无法准备截图上传，请稍后重试。",
      );
    }

    const parsed = PrepareUploadResultSchema.safeParse(data);
    if (!parsed.success) {
      throw new AppServiceError(
        "upload_failed",
        "上传服务返回了无效的准备结果。",
        true,
      );
    }
    return parsed.data;
  }

  async markUploaded(id: EntityId) {
    await requireSession(this.client);
    const input = MarkUploadedInputSchema.safeParse({ uploadId: id });
    if (!input.success) throw invalidUploadInput(input.error.issues);

    const { data, error } = await this.client.functions.invoke(
      "mark-uploaded",
      { body: input.data },
    );
    if (error) {
      throw await functionError(
        error,
        data,
        "upload_failed",
        "无法确认截图上传结果，请稍后重试。",
      );
    }

    const parsed = UploadSchema.safeParse(data);
    if (
      !parsed.success ||
      parsed.data.id !== id ||
      parsed.data.status !== "uploaded"
    ) {
      throw new AppServiceError(
        "upload_failed",
        "上传服务未确认截图已完成。",
        true,
      );
    }
    return parsed.data;
  }
}

export class SupabaseScreenshotUploadTransport
  implements ScreenshotUploadTransport
{
  private readonly readFile: ScreenshotFileReader;

  constructor(
    private readonly client: SupabaseClient,
    readFile: ScreenshotFileReader = readScreenshotFile,
  ) {
    this.readFile = readFile;
  }

  async upload(input: {
    prepared: {
      uploadId: string;
      storagePath: string;
      signedUploadToken: string;
    };
    file: ScreenshotUploadFile;
  }): Promise<void> {
    await requireSession(this.client);
    const prepared = PrepareUploadResultSchema.safeParse(input.prepared);
    const file = PrepareUploadInputSchema.safeParse({
      byteSize: input.file.byteSize,
      mimeType: input.file.mimeType,
      originalFileName: "source",
    });
    if (!prepared.success || !file.success) {
      throw invalidUploadInput([
        ...(prepared.success ? [] : prepared.error.issues),
        ...(file.success ? [] : file.error.issues),
      ]);
    }

    let bytes: ArrayBuffer;
    try {
      bytes = await this.readFile(input.file.uri);
    } catch (error) {
      throw providerError(
        error,
        "upload_failed",
        "无法读取待上传的截图。",
      );
    }
    if (bytes.byteLength !== input.file.byteSize) {
      throw new AppServiceError(
        "validation_failed",
        "截图大小与客户端校验结果不一致，请重新选择。",
        false,
      );
    }

    const { error } = await this.client.storage
      .from(SCREENSHOT_BUCKET)
      .uploadToSignedUrl(
        prepared.data.storagePath,
        prepared.data.signedUploadToken,
        bytes,
        { contentType: input.file.mimeType, upsert: false },
      );
    if (error) {
      throw providerError(
        error,
        "upload_failed",
        "截图上传失败，请检查网络后重试。",
      );
    }
  }
}

async function readScreenshotFile(uri: string): Promise<ArrayBuffer> {
  const { File } = await import("expo-file-system");
  return new File(uri).arrayBuffer();
}

async function requireSession(client: SupabaseClient) {
  const { data, error } = await client.auth.getSession();
  if (error) {
    throw providerError(
      error,
      "unauthenticated",
      "登录状态已失效，请重新登录。",
      false,
    );
  }
  if (!data.session) {
    throw new AppServiceError(
      "unauthenticated",
      "请先登录后再上传截图。",
      false,
    );
  }
  return data.session;
}

async function functionError(
  error: unknown,
  data: unknown,
  fallbackCode: "upload_failed",
  fallbackMessage: string,
) {
  if (isContractErrorShape(data)) {
    return new AppServiceError(
      data.code,
      data.message,
      data.retryable,
      data.details,
    );
  }

  const response = functionErrorResponse(error);
  if (response) {
    if (response.status === 401) {
      return new AppServiceError(
        "unauthenticated",
        "登录状态已失效，请重新登录。",
        false,
      );
    }
    try {
      const body = (await response.clone().json()) as unknown;
      if (isContractErrorShape(body)) {
        return new AppServiceError(
          body.code,
          body.message,
          body.retryable,
          body.details,
        );
      }
    } catch {
      // The stable fallback below intentionally hides provider response details.
    }
  }

  return providerError(error, fallbackCode, fallbackMessage);
}

function functionErrorResponse(error: unknown): Response | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "context" in error &&
    error.context instanceof Response
  ) {
    return error.context;
  }
  return null;
}

function providerError(
  error: unknown,
  code: "internal_error" | "unauthenticated" | "upload_failed",
  message: string,
  retryable = true,
) {
  return new AppServiceError(code, message, retryable, {
    providerCode: safeProviderCode(error),
  });
}

function safeProviderCode(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    if ("code" in error && typeof error.code === "string") return error.code;
    if ("name" in error && typeof error.name === "string") return error.name;
  }
  return "unknown";
}

function invalidUploadInput(issues: readonly { path: PropertyKey[] }[]) {
  return new AppServiceError(
    "validation_failed",
    "截图不符合上传要求。",
    false,
    { fields: issues.map((issue) => issue.path.join(".")) },
  );
}

function parseUploadRow(row: Record<string, unknown>): Upload {
  const parsed = UploadSchema.safeParse({
    id: row.id,
    userId: row.user_id,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    status: row.status,
    errorCode: row.error_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
  if (!parsed.success) {
    throw new AppServiceError(
      "internal_error",
      "上传服务返回了无效记录。",
      true,
    );
  }
  return parsed.data;
}
