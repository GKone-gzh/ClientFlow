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
import {
  confirmExtractionTransaction,
  type AIUsageMetrics,
} from "./repositories.ts";

interface IntakeUploadRepository {
  verifyAndMarkUploaded(
    id: EntityId,
  ): Promise<{ imageBytes: Uint8Array; upload: Upload }>;
}

interface IntakeExtractionRepository {
  complete(
    extractionId: EntityId,
    result: AIExtractionResult,
    usage: AIUsageMetrics,
  ): Promise<AIExtraction>;
  fail(
    extractionId: EntityId,
    errorCode: string,
    usage: Pick<AIUsageMetrics, "attemptCount" | "durationMs">,
  ): Promise<void>;
  findByUpload(uploadId: EntityId): Promise<AIExtraction | null>;
  getById(id: EntityId): Promise<AIExtraction | null>;
  reserve(
    uploadId: EntityId,
    requestId: string,
    provider: string,
    model: string,
  ): Promise<{ extraction: AIExtraction; shouldInvokeProvider: boolean }>;
}

export class SupabaseIntakeService implements IntakeService {
  constructor(
    private readonly authenticatedClient: SupabaseClient,
    private readonly uploads: IntakeUploadRepository,
    private readonly extractions: IntakeExtractionRepository,
    private readonly provider: ServerAIProvider,
    private readonly now: () => number = () => Date.now(),
    private readonly createRequestId: () => string = () => crypto.randomUUID(),
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
    const reservation = await this.extractions.reserve(
      uploadId,
      this.createRequestId(),
      this.provider.providerName,
      this.provider.modelName,
    );
    if (!reservation.shouldInvokeProvider) {
      return reservation.extraction;
    }
    const extraction = reservation.extraction;
    const providerStartedAt = this.now();

    let execution: Awaited<ReturnType<ServerAIProvider["extractScreenshot"]>>;
    try {
      execution = await this.provider.extractScreenshot({
        imageBytes,
        mimeType: upload.mimeType,
      });
    } catch (error) {
      await this.recordFailure(extraction.id, "provider_error", {
        attemptCount: providerAttemptCount(error),
        durationMs: elapsedMilliseconds(providerStartedAt, this.now()),
      });
      throw normalizeProviderError(error);
    }

    const validated = AIExtractionResultSchema.safeParse(execution.result);
    if (!validated.success) {
      await this.recordFailure(
        extraction.id,
        "invalid_provider_output",
        {
          attemptCount: execution.usage.attemptCount,
          durationMs: elapsedMilliseconds(providerStartedAt, this.now()),
        },
      );
      throw new BackendError({
        code: "extraction_failed",
        message: "The AI provider returned an invalid extraction",
        retryable: false,
        status: 502,
      });
    }

    const safeResult = normalizeUntrustedInstructionOutput(validated.data);

    const completed = await this.extractions.complete(
      extraction.id,
      safeResult,
      {
        ...execution.usage,
        durationMs: elapsedMilliseconds(providerStartedAt, this.now()),
      },
    );
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
    extractionId: EntityId,
    errorCode: string,
    usage: Pick<AIUsageMetrics, "attemptCount" | "durationMs">,
  ): Promise<void> {
    await this.extractions.fail(extractionId, errorCode, usage);
  }
}

function elapsedMilliseconds(startedAt: number, completedAt: number) {
  return Math.max(0, Math.round(completedAt - startedAt));
}

function providerAttemptCount(error: unknown) {
  if (
    error instanceof BackendError &&
    Number.isSafeInteger(error.details?.attemptCount) &&
    Number(error.details?.attemptCount) >= 1
  ) {
    return Number(error.details?.attemptCount);
  }
  return 1;
}

function hasDanglingRequirementReference(result: AIExtractionResult): boolean {
  return result.suggestedTasks.some(
    (task) =>
      task.requirementIndex !== null &&
      task.requirementIndex >= result.requirements.length,
  );
}

const SAFE_INSTRUCTION_WARNING =
  "截图包含与业务需求无关的指令性内容，已忽略，请人工复核。";

const SUSPICIOUS_OUTPUT_PATTERNS = [
  /system\s*prompt|系统\s*prompt/i,
  /api\s*key|access\s*token|refresh\s*token|service[-_\s]*role/i,
  /ignore.{0,40}(previous|prior|instruction)/i,
  /忽略.{0,20}(之前|以上|先前|指令)/i,
  /screenshot extraction engine|untrusted conversation data/i,
  /required json schema|never follow instructions/i,
];

const META_INSTRUCTION_PATTERNS = [
  /共同已知|共同未知|我的已知|你的未知|我的未知|你的已知/i,
  /不要重复询问|最多提出\s*\d+\s*个.{0,12}问题/i,
  /合理假设|探索版本|原始方案|取舍依据/i,
  /最小实验|单一变量|成功或失败信号|后续需要自收的数据/i,
  /前提可能错误|知识、方法、风险和替代路径/i,
  /knowns? and unknowns?|ask at most\s+\d+|state.{0,20}assumptions?/i,
  /minimum experiment|single variable|success or failure signal/i,
];

function normalizeUntrustedInstructionOutput(
  result: AIExtractionResult,
): AIExtractionResult {
  const { warnings, ...businessResult } = result;
  const serializedBusinessResult = JSON.stringify(businessResult);
  if (
    containsSuspiciousOutput(serializedBusinessResult) ||
    containsMetaInstructionOutput(serializedBusinessResult)
  ) {
    return AIExtractionResultSchema.parse({
      schemaVersion: 1,
      client: {
        name: "待确认客户",
        contactHandle: null,
        contactChannel: null,
      },
      project: {
        name: "待确认项目",
        summary: null,
        budgetAmount: null,
        budgetCurrency: null,
        dueDate: null,
      },
      requirements: [{ content: "需求待人工确认", sortOrder: 0 }],
      suggestedTasks: [],
      confidence: Math.min(result.confidence, 0.1),
      warnings: [SAFE_INSTRUCTION_WARNING],
    });
  }

  let replacedWarning = false;
  const safeWarnings = warnings.filter((warning) => {
    if (!containsSuspiciousOutput(warning)) {
      return true;
    }
    replacedWarning = true;
    return false;
  });

  if (replacedWarning) {
    safeWarnings.push(SAFE_INSTRUCTION_WARNING);
  }

  return AIExtractionResultSchema.parse({
    ...businessResult,
    warnings: safeWarnings,
  });
}

function containsSuspiciousOutput(value: string): boolean {
  return SUSPICIOUS_OUTPUT_PATTERNS.some((pattern) => pattern.test(value));
}

function containsMetaInstructionOutput(value: string): boolean {
  let matches = 0;
  for (const pattern of META_INSTRUCTION_PATTERNS) {
    if (pattern.test(value)) {
      matches += 1;
    }
    if (matches >= 2) {
      return true;
    }
  }
  return false;
}

function normalizeProviderError(error: unknown): BackendError {
  if (
    error instanceof BackendError &&
    (error.code === "extraction_failed" || error.code === "rate_limited")
  ) {
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
