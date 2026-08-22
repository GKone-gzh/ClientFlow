import {
  AIExtractionResultSchema,
  ConfirmExtractionInputSchema,
  type AIExtraction,
  type AIExtractionResult,
  type ConfirmExtractionInput,
  type ConfirmExtractionResult,
  type EntityId,
  type IntakeService,
  type Upload,
} from "@clientflow/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ServerAIProvider } from "./ai-provider.ts";
import { BackendError } from "./errors.ts";
import { confirmExtractionTransaction } from "./repositories.ts";

interface IntakeUploadRepository {
  markCompleted(id: EntityId): Promise<void>;
  markFailed(id: EntityId, errorCode: string): Promise<void>;
  markProcessing(id: EntityId): Promise<void>;
  verifyAndMarkUploaded(
    id: EntityId,
  ): Promise<{ imageBytes: Uint8Array; upload: Upload }>;
}

interface IntakeExtractionRepository {
  complete(
    extractionId: EntityId,
    result: AIExtractionResult,
    provider: string,
    model: string,
  ): Promise<AIExtraction>;
  fail(extractionId: EntityId, errorCode: string): Promise<void>;
  findByUpload(uploadId: EntityId): Promise<AIExtraction | null>;
  getById(id: EntityId): Promise<AIExtraction | null>;
  start(uploadId: EntityId): Promise<AIExtraction>;
}

export class SupabaseIntakeService implements IntakeService {
  constructor(
    private readonly authenticatedClient: SupabaseClient,
    private readonly uploads: IntakeUploadRepository,
    private readonly extractions: IntakeExtractionRepository,
    private readonly provider: ServerAIProvider,
  ) {}

  async requestExtraction(uploadId: EntityId): Promise<AIExtraction> {
    const existing = await this.extractions.findByUpload(uploadId);
    if (
      existing?.status === "needs_review" ||
      existing?.status === "confirmed"
    ) {
      return existing;
    }

    const { imageBytes, upload } =
      await this.uploads.verifyAndMarkUploaded(uploadId);
    await this.uploads.markProcessing(uploadId);
    const extraction = await this.extractions.start(uploadId);

    if (
      extraction.status === "needs_review" ||
      extraction.status === "confirmed"
    ) {
      return extraction;
    }

    let rawResult: unknown;
    try {
      rawResult = await this.provider.extractScreenshot({
        imageBytes,
        mimeType: upload.mimeType,
      });
    } catch (error) {
      await this.recordFailure(uploadId, extraction.id, "provider_error");
      throw normalizeProviderError(error);
    }

    const validated = AIExtractionResultSchema.safeParse(rawResult);
    if (!validated.success) {
      await this.recordFailure(
        uploadId,
        extraction.id,
        "invalid_provider_output",
      );
      throw new BackendError({
        code: "extraction_failed",
        message: "The AI provider returned an invalid extraction",
        retryable: false,
        status: 502,
      });
    }

    const completed = await this.extractions.complete(
      extraction.id,
      validated.data,
      this.provider.providerName,
      this.provider.modelName,
    );
    await this.uploads.markCompleted(uploadId);
    return completed;
  }

  async getValidatedResult(
    extractionId: EntityId,
  ): Promise<AIExtractionResult | null> {
    const extraction = await this.extractions.getById(extractionId);
    if (extraction === null) {
      throw new BackendError({
        code: "not_found",
        message: "The extraction was not found",
        status: 404,
      });
    }

    return extraction.result;
  }

  async getExtraction(extractionId: EntityId): Promise<AIExtraction> {
    const extraction = await this.extractions.getById(extractionId);
    if (extraction === null) {
      throw new BackendError({
        code: "not_found",
        message: "The extraction was not found",
        status: 404,
      });
    }
    return extraction;
  }

  async confirm(
    input: ConfirmExtractionInput,
  ): Promise<ConfirmExtractionResult> {
    const validated = ConfirmExtractionInputSchema.safeParse(input);
    if (!validated.success || hasDanglingRequirementReference(input.result)) {
      throw new BackendError({
        code: "validation_failed",
        message: "The confirmation payload is invalid",
        status: 400,
      });
    }

    return confirmExtractionTransaction(this.authenticatedClient, validated.data);
  }

  private async recordFailure(
    uploadId: EntityId,
    extractionId: EntityId,
    errorCode: string,
  ): Promise<void> {
    await Promise.all([
      this.extractions.fail(extractionId, errorCode),
      this.uploads.markFailed(uploadId, errorCode),
    ]);
  }
}

function hasDanglingRequirementReference(result: AIExtractionResult): boolean {
  return result.suggestedTasks.some(
    (task) =>
      task.requirementIndex !== null &&
      task.requirementIndex >= result.requirements.length,
  );
}

function normalizeProviderError(error: unknown): BackendError {
  if (error instanceof BackendError && error.code === "extraction_failed") {
    return error;
  }

  return new BackendError({
    code: "extraction_failed",
    message: "The AI provider failed to extract the screenshot",
    retryable: true,
    status: 502,
    cause: error,
  });
}
