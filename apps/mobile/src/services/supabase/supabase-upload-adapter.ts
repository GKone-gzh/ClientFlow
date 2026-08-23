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
  invokeContractFunction,
  providerError,
  requireSupabaseSession,
} from "@/services/supabase/supabase-adapter-utils";
import { AppServiceError } from "@/services/service-error";

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
    await requireSupabaseSession(this.client);
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
    await requireSupabaseSession(this.client);
    const parsedInput = PrepareUploadInputSchema.safeParse(input);
    if (!parsedInput.success) throw invalidUploadInput(parsedInput.error.issues);

    return invokeContractFunction({
      body: parsedInput.data,
      client: this.client,
      fallbackCode: "upload_failed",
      fallbackMessage: "无法准备截图上传，请稍后重试。",
      functionName: "prepare-upload",
      invalidResponseMessage: "上传服务返回了无效的准备结果。",
      schema: PrepareUploadResultSchema,
    });
  }

  async markUploaded(id: EntityId) {
    await requireSupabaseSession(this.client);
    const input = MarkUploadedInputSchema.safeParse({ uploadId: id });
    if (!input.success) throw invalidUploadInput(input.error.issues);

    const upload = await invokeContractFunction({
      body: input.data,
      client: this.client,
      fallbackCode: "upload_failed",
      fallbackMessage: "无法确认截图上传结果，请稍后重试。",
      functionName: "mark-uploaded",
      invalidResponseMessage: "上传服务未确认截图已完成。",
      schema: UploadSchema,
    });
    if (upload.id !== id || upload.status !== "uploaded") {
      throw new AppServiceError(
        "upload_failed",
        "上传服务未确认截图已完成。",
        true,
      );
    }
    return upload;
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
    await requireSupabaseSession(this.client);
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
