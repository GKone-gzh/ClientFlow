import type {
  EntityId,
  PrepareUploadInput,
  PrepareUploadResult,
  Upload,
  UploadRepository,
} from "@clientflow/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";

import { BackendError, databaseError } from "./errors.ts";
import { mapUpload } from "./mappers.ts";

export const INTAKE_SCREENSHOTS_BUCKET = "chat-screenshots";

export class PrivateStorageUploadAdapter {
  constructor(
    private readonly admin: SupabaseClient,
    private readonly bucket = INTAKE_SCREENSHOTS_BUCKET,
  ) {}

  async createSignedUploadToken(storagePath: string): Promise<string> {
    const { data, error } = await this.admin.storage
      .from(this.bucket)
      .createSignedUploadUrl(storagePath);

    if (error !== null || data?.token === undefined) {
      throw new BackendError({
        code: "upload_failed",
        message: "Unable to prepare the private upload",
        retryable: true,
        status: 502,
        cause: error,
      });
    }

    return data.token;
  }

  async downloadVerified(upload: Upload): Promise<Uint8Array> {
    const { data, error } = await this.admin.storage
      .from(this.bucket)
      .download(upload.storagePath);

    if (error !== null || data === null) {
      throw new BackendError({
        code: "upload_failed",
        message: "The uploaded screenshot could not be read",
        retryable: true,
        status: 422,
        cause: error,
      });
    }

    if (data.size !== upload.byteSize) {
      throw new BackendError({
        code: "upload_failed",
        message: "The uploaded screenshot size does not match its declaration",
        status: 422,
      });
    }

    if (data.type !== "" && data.type !== upload.mimeType) {
      throw new BackendError({
        code: "upload_failed",
        message: "The uploaded screenshot type does not match its declaration",
        status: 422,
      });
    }

    return new Uint8Array(await data.arrayBuffer());
  }

  async remove(storagePath: string): Promise<void> {
    const { error } = await this.admin.storage
      .from(this.bucket)
      .remove([storagePath]);
    if (error !== null) {
      throw new BackendError({
        code: "upload_failed",
        message: "Unable to remove the private upload",
        retryable: true,
        status: 502,
        cause: error,
      });
    }
  }
}

export class SupabaseUploadRepository implements UploadRepository {
  constructor(
    private readonly admin: SupabaseClient,
    private readonly storage: PrivateStorageUploadAdapter,
    private readonly userId: string,
    private readonly createId: () => string = () => crypto.randomUUID(),
  ) {}

  async getById(id: EntityId): Promise<Upload | null> {
    const { data, error } = await this.admin
      .from("uploads")
      .select("*")
      .eq("id", id)
      .eq("user_id", this.userId)
      .maybeSingle();
    throwIfError(error, "Unable to load the upload");
    return data === null ? null : mapUpload(data);
  }

  async prepare(input: PrepareUploadInput): Promise<PrepareUploadResult> {
    const uploadId = this.createId();
    const storagePath = `${this.userId}/${uploadId}/source`;
    const { error } = await this.admin.from("uploads").insert({
      id: uploadId,
      user_id: this.userId,
      storage_path: storagePath,
      mime_type: input.mimeType,
      byte_size: input.byteSize,
      status: "pending",
    });
    throwIfError(error, "Unable to create upload metadata");

    try {
      const signedUploadToken =
        await this.storage.createSignedUploadToken(storagePath);
      return { uploadId, storagePath, signedUploadToken };
    } catch (error) {
      await this.admin
        .from("uploads")
        .delete()
        .eq("id", uploadId)
        .eq("user_id", this.userId);
      throw error;
    }
  }

  async markUploaded(id: EntityId): Promise<Upload> {
    const verified = await this.verifyAndMarkUploaded(id);
    return verified.upload;
  }

  async verifyAndMarkUploaded(
    id: EntityId,
  ): Promise<{ imageBytes: Uint8Array; upload: Upload }> {
    const upload = await this.getById(id);
    if (upload === null) {
      throw new BackendError({
        code: "not_found",
        message: "The upload was not found",
        status: 404,
      });
    }

    if (upload.status !== "pending" && upload.status !== "uploaded") {
      throw new BackendError({
        code: "conflict",
        message: "The upload cannot be verified in its current state",
        status: 409,
      });
    }

    const imageBytes = await this.storage.downloadVerified(upload);
    const { data, error } = await this.admin
      .from("uploads")
      .update({ status: "uploaded", error_code: null })
      .eq("id", upload.id)
      .eq("user_id", this.userId)
      .in("status", ["pending", "uploaded"])
      .select("*")
      .single();
    throwIfError(error, "Unable to mark the upload as uploaded");

    return { imageBytes, upload: mapUpload(requireRow(data)) };
  }

  async markProcessing(id: EntityId): Promise<void> {
    await this.transition(id, "uploaded", "processing");
  }

  async markCompleted(id: EntityId): Promise<void> {
    await this.transition(id, "processing", "completed");
  }

  async markFailed(id: EntityId, errorCode: string): Promise<void> {
    const { error } = await this.admin
      .from("uploads")
      .update({ status: "failed", error_code: errorCode })
      .eq("id", id)
      .eq("user_id", this.userId)
      .in("status", ["pending", "uploaded", "processing"]);
    throwIfError(error, "Unable to record the upload failure");
  }

  private async transition(
    id: EntityId,
    from: Upload["status"],
    to: Upload["status"],
  ): Promise<void> {
    const { data, error } = await this.admin
      .from("uploads")
      .update({ status: to, error_code: null })
      .eq("id", id)
      .eq("user_id", this.userId)
      .eq("status", from)
      .select("id")
      .maybeSingle();
    throwIfError(error, "Unable to update the upload state");

    if (data === null) {
      throw new BackendError({
        code: "conflict",
        message: "The upload state changed concurrently",
        retryable: true,
        status: 409,
      });
    }
  }
}

function throwIfError(error: unknown, message: string): void {
  if (error !== null && error !== undefined) {
    throw databaseError(error, message);
  }
}

function requireRow(data: unknown): Record<string, unknown> {
  if (typeof data !== "object" || data === null) {
    throw new BackendError({
      code: "internal_error",
      message: "The database returned no upload record",
      status: 500,
    });
  }
  return data as Record<string, unknown>;
}
