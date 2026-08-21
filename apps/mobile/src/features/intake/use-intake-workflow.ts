import { router } from "expo-router";

import { IntakeServiceError } from "@/mocks/mock-intake-services";
import { appServices } from "@/services/app-services";
import type { MockAIScenario } from "@/services/ai/mock-ai-provider";
import {
  ScreenshotSelectionError,
  selectAndCompressScreenshot,
} from "@/services/images/screenshot-service";
import { useIntakeFlowStore } from "@/store/intake-flow-store";

const ERROR_MESSAGES: Record<string, string> = {
  extraction_failed: "AI 识别失败，请重试或重新上传。",
  upload_failed: "截图上传失败，请重试。",
  validation_failed: "AI 返回内容不符合数据格式，请重新识别。",
};

export function useIntakeWorkflow() {
  const state = useIntakeFlowStore();

  const selectScreenshot = async () => {
    state.setStage("selecting");
    try {
      state.setStage("compressing");
      const screenshot = await selectAndCompressScreenshot();
      if (!screenshot) {
        state.setStage(state.screenshot ? "idle" : "idle");
        return;
      }
      state.setScreenshot(screenshot);
      state.setStage("idle");
    } catch (error) {
      state.setError({
        code: "validation_failed",
        message:
          error instanceof ScreenshotSelectionError
            ? error.message
            : "图片处理失败，请重新选择。",
        retryable: false,
      });
    }
  };

  const processScreenshot = async (scenario: MockAIScenario) => {
    const screenshot = useIntakeFlowStore.getState().screenshot;
    if (!screenshot) {
      state.setError({
        code: "validation_failed",
        message: "请先选择一张聊天截图。",
        retryable: false,
      });
      return;
    }

    state.setScenario(scenario);
    state.setStage("uploading");
    try {
      const prepared = await appServices.uploads.prepare({
        mimeType: screenshot.mimeType,
        byteSize: screenshot.byteSize,
        originalFileName: `mock-${scenario}--${screenshot.fileName}`,
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
      await appServices.uploads.markUploaded(prepared.uploadId);

      state.setStage("processing");
      const extraction = await appServices.intake.requestExtraction(prepared.uploadId);
      if (extraction.status === "failed") {
        const code = extraction.errorCode ?? "extraction_failed";
        throw new IntakeServiceError(
          code === "validation_failed" ? "validation_failed" : "extraction_failed",
          "Extraction failed",
          true,
        );
      }
      const result = await appServices.intake.getValidatedResult(extraction.id);
      if (!result) {
        throw new IntakeServiceError(
          "extraction_failed",
          "Extraction result is not ready",
          true,
        );
      }

      state.setExtractionId(extraction.id);
      router.push(`/(app)/intake/${extraction.id}/review`);
    } catch (error) {
      const serviceError = error instanceof IntakeServiceError ? error : null;
      const code = serviceError?.code ?? "internal_error";
      state.setError({
        code,
        message: ERROR_MESSAGES[code] ?? "处理失败，请重试。",
        retryable: serviceError?.retryable ?? true,
      });
    }
  };

  return {
    ...state,
    cancel: () => {
      state.reset();
      router.back();
    },
    processScreenshot,
    retry: () => processScreenshot(state.lastScenario),
    selectScreenshot,
  };
}
