import {
  AIExtractionSchema,
  ConfirmExtractionInputSchema,
  ConfirmExtractionResultSchema,
  EntityIdSchema,
  GetExtractionInputSchema,
  RequestExtractionInputSchema,
  type AIExtraction,
  type AIExtractionRepository,
  type AIExtractionResult,
  type ConfirmExtractionInput,
  type ConfirmExtractionResult,
  type EntityId,
  type IntakeService,
} from "@clientflow/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";

import { AppServiceError } from "@/services/service-error";
import { invokeContractFunction } from "@/services/supabase/supabase-adapter-utils";

export class SupabaseIntakeAdapter
  implements IntakeService, AIExtractionRepository
{
  constructor(private readonly client: SupabaseClient) {}

  async start(uploadId: EntityId): Promise<AIExtraction> {
    return this.requestExtraction(uploadId);
  }

  async requestExtraction(uploadId: EntityId): Promise<AIExtraction> {
    const input = RequestExtractionInputSchema.safeParse({ uploadId });
    if (!input.success) throw invalidIntakeInput("上传记录无效。");
    const extraction = await invokeContractFunction({
      body: input.data,
      client: this.client,
      fallbackCode: "extraction_failed",
      fallbackMessage: "无法识别截图，请稍后重试。",
      functionName: "request-extraction",
      invalidResponseMessage: "识别服务返回了无效结果。",
      schema: AIExtractionSchema,
    });
    if (extraction.uploadId !== uploadId) {
      throw invalidIntakeResponse();
    }
    return extraction;
  }

  async getById(id: EntityId): Promise<AIExtraction | null> {
    const input = GetExtractionInputSchema.safeParse({ extractionId: id });
    if (!input.success) throw invalidIntakeInput("识别记录无效。");
    try {
      const extraction = await invokeContractFunction({
        body: input.data,
        client: this.client,
        fallbackCode: "extraction_failed",
        fallbackMessage: "无法读取识别结果，请稍后重试。",
        functionName: "get-extraction",
        invalidResponseMessage: "识别服务返回了无效记录。",
        schema: AIExtractionSchema,
      });
      if (extraction.id !== id) throw invalidIntakeResponse();
      return extraction;
    } catch (error) {
      if (error instanceof AppServiceError && error.code === "not_found") {
        return null;
      }
      throw error;
    }
  }

  async getValidatedResult(
    extractionId: EntityId,
  ): Promise<AIExtractionResult | null> {
    const extraction = await this.getById(extractionId);
    return extraction?.result ?? null;
  }

  async confirm(
    input: ConfirmExtractionInput,
  ): Promise<ConfirmExtractionResult> {
    const validated = ConfirmExtractionInputSchema.safeParse(input);
    if (!validated.success) {
      throw invalidIntakeInput("确认内容不符合要求，请检查后重试。");
    }
    const confirmation = await invokeContractFunction({
      body: validated.data,
      client: this.client,
      fallbackCode: "internal_error",
      fallbackMessage: "无法创建客户资料，请稍后重试。",
      functionName: "confirm-extraction",
      invalidResponseMessage: "确认服务返回了无效结果。",
      schema: ConfirmExtractionResultSchema,
    });
    if (
      !EntityIdSchema.safeParse(confirmation.clientId).success ||
      !EntityIdSchema.safeParse(confirmation.projectId).success
    ) {
      throw invalidIntakeResponse();
    }
    return confirmation;
  }
}

function invalidIntakeInput(message: string) {
  return new AppServiceError("validation_failed", message, false);
}

function invalidIntakeResponse() {
  return new AppServiceError(
    "extraction_failed",
    "识别服务返回了不匹配的记录。",
    true,
  );
}
