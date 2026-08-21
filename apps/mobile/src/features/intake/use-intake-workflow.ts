import { router } from "expo-router";

import {
  createIntakeOperationId,
  runIntakeWorkflow,
  type IntakeWorkflowFailure,
} from "@/features/intake/intake-workflow";
import {
  useAppServices,
  useDevelopmentTools,
} from "@/services/app-service-provider";
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

function displayFailure(failure: IntakeWorkflowFailure | null) {
  if (!failure) return null;
  return {
    ...failure.error,
    message:
      failure.error.retryable
        ? (ERROR_MESSAGES[failure.error.code] ?? failure.error.message)
        : failure.error.message,
  };
}

export function useIntakeWorkflow() {
  const state = useIntakeFlowStore();
  const services = useAppServices();
  const developmentTools = useDevelopmentTools();

  const selectScreenshot = async () => {
    state.setStage("selecting");
    try {
      state.setStage("compressing");
      const screenshot = await selectAndCompressScreenshot();
      if (!screenshot) {
        state.setStage("idle");
        return;
      }
      state.setScreenshot(screenshot, createIntakeOperationId());
      state.setStage("idle");
    } catch (error) {
      state.setError({
        step: "upload",
        error: {
          code: "validation_failed",
          message:
            error instanceof ScreenshotSelectionError
              ? error.message
              : "图片处理失败，请重新选择。",
          retryable: false,
        },
      });
    }
  };

  const processScreenshot = async (retry = false) => {
    const current = useIntakeFlowStore.getState();
    if (!current.screenshot) {
      current.setError({
        step: "upload",
        error: {
          code: "validation_failed",
          message: "请先选择一张聊天截图。",
          retryable: false,
        },
      });
      return;
    }

    const operationId = current.operationId ?? createIntakeOperationId();
    const result = await runIntakeWorkflow({
      services,
      screenshot: current.screenshot,
      operationId,
      previous: retry ? current.workflow : null,
      onStateChange: current.setWorkflow,
    });
    if (result.status === "awaiting_review" && result.extractionId) {
      router.push(`/(app)/intake/${result.extractionId}/review`);
    }
  };

  const processDevelopmentScenario = async (scenarioId: string) => {
    if (!developmentTools) return;
    developmentTools.selectIntakeScenario(scenarioId);
    await processScreenshot(false);
  };

  return {
    ...state,
    developmentScenarios: developmentTools?.intakeScenarios ?? [],
    error: displayFailure(state.error),
    cancel: () => {
      state.reset();
      router.back();
    },
    processDevelopmentScenario,
    processScreenshot: () => processScreenshot(false),
    retry: () => processScreenshot(true),
    selectScreenshot,
  };
}
