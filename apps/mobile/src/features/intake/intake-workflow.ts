import type {
  AIExtractionResult,
  ConfirmExtractionResult,
  ContractErrorShape,
} from "@clientflow/contracts";

import type { AppServices } from "@/services/app-services";
import { toContractError } from "@/services/service-error";
import type { PreparedScreenshot } from "@/services/images/screenshot-service";

export type IntakeWorkflowStep =
  | "upload"
  | "extraction"
  | "review"
  | "confirmation";

export type IntakeWorkflowStatus =
  | "uploading"
  | "uploaded"
  | "extracting"
  | "awaiting_review"
  | "confirming"
  | "confirmed"
  | "failed";

export interface IntakeWorkflowFailure {
  step: IntakeWorkflowStep;
  error: ContractErrorShape;
}

export interface IntakeWorkflowState {
  operationId: string;
  attempt: number;
  status: IntakeWorkflowStatus;
  uploadId: string | null;
  extractionId: string | null;
  confirmation: ConfirmExtractionResult | null;
  failure: IntakeWorkflowFailure | null;
  retryFrom: IntakeWorkflowStep | null;
  replayed: boolean;
}

interface RunIntakeWorkflowInput {
  services: Pick<AppServices, "uploads" | "screenshotUpload" | "intake">;
  screenshot: PreparedScreenshot;
  operationId: string;
  stopAfterUpload?: boolean;
  previous?: IntakeWorkflowState | null;
  onStateChange?: (state: IntakeWorkflowState) => void;
}

interface ConfirmIntakeWorkflowInput {
  services: Pick<AppServices, "intake">;
  extractionId: string;
  result: AIExtractionResult;
  onStateChange?: (state: IntakeWorkflowState) => void;
}

const intakeOperations = new Map<string, Promise<IntakeWorkflowState>>();
const completedIntakeOperations = new Map<string, IntakeWorkflowState>();
const confirmedOperations = new Map<string, IntakeWorkflowState>();
const confirmationOperations = new Map<string, Promise<IntakeWorkflowState>>();
const confirmationAttempts = new Map<string, number>();

function emit(
  state: IntakeWorkflowState,
  listener?: (state: IntakeWorkflowState) => void,
) {
  const snapshot = {
    ...state,
    confirmation: state.confirmation ? { ...state.confirmation } : null,
    failure: state.failure
      ? { ...state.failure, error: { ...state.failure.error } }
      : null,
  };
  listener?.(snapshot);
  return snapshot;
}

function failedState(
  state: IntakeWorkflowState,
  step: IntakeWorkflowStep,
  error: unknown,
) {
  const fallback =
    step === "upload"
      ? {
          code: "upload_failed" as const,
          message: "Screenshot upload failed",
          retryable: true,
        }
      : step === "confirmation"
        ? {
            code: "internal_error" as const,
            message: "Confirmation failed",
            retryable: true,
          }
        : {
          code: "extraction_failed" as const,
          message: "Screenshot extraction failed",
          retryable: true,
        };
  const normalized = toContractError(error, fallback);
  return {
    ...state,
    status: "failed" as const,
    failure: { step, error: normalized },
    retryFrom: normalized.retryable ? step : null,
  };
}

export function createIntakeOperationId() {
  return `intake-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function runIntakeWorkflow(
  input: RunIntakeWorkflowInput,
): Promise<IntakeWorkflowState> {
  const completed = completedIntakeOperations.get(input.operationId);
  if (completed) return { ...completed, replayed: true };

  const existing = intakeOperations.get(input.operationId);
  if (existing) {
    const result = await existing;
    return { ...result, replayed: true };
  }

  const operation = executeIntakeWorkflow(input);
  intakeOperations.set(input.operationId, operation);
  try {
    const result = await operation;
    if (result.status === "awaiting_review") {
      completedIntakeOperations.set(input.operationId, result);
    }
    return result;
  } finally {
    intakeOperations.delete(input.operationId);
  }
}

async function executeIntakeWorkflow({
  services,
  screenshot,
  operationId,
  stopAfterUpload = false,
  previous,
  onStateChange,
}: RunIntakeWorkflowInput): Promise<IntakeWorkflowState> {
  const canResumeExtraction =
    previous?.status === "failed" &&
    previous.retryFrom !== "upload" &&
    previous.uploadId !== null;
  let state: IntakeWorkflowState = {
    operationId,
    attempt: (previous?.attempt ?? 0) + 1,
    status: canResumeExtraction ? "extracting" : "uploading",
    uploadId: canResumeExtraction ? previous.uploadId : null,
    extractionId: null,
    confirmation: null,
    failure: null,
    retryFrom: null,
    replayed: false,
  };
  emit(state, onStateChange);

  try {
    if (!state.uploadId) {
      const prepared = await services.uploads.prepare({
        mimeType: screenshot.mimeType,
        byteSize: screenshot.byteSize,
        originalFileName: screenshot.fileName,
      });
      await services.screenshotUpload.upload({
        prepared,
        file: {
          uri: screenshot.uri,
          mimeType: screenshot.mimeType,
          byteSize: screenshot.byteSize,
        },
      });
      await services.uploads.markUploaded(prepared.uploadId);
      state = {
        ...state,
        uploadId: prepared.uploadId,
        status: stopAfterUpload ? "uploaded" : "extracting",
      };
      emit(state, onStateChange);
      if (stopAfterUpload) return state;
    }
  } catch (error) {
    return emit(failedState(state, "upload", error), onStateChange);
  }

  try {
    const extraction = await services.intake.requestExtraction(state.uploadId!);
    state = { ...state, extractionId: extraction.id };
    if (extraction.status === "failed") {
      const validationFailed = extraction.errorCode === "validation_failed";
      return emit(
        failedState(
          state,
          validationFailed ? "review" : "extraction",
          {
            code: validationFailed ? "validation_failed" : "extraction_failed",
            message: "Extraction failed",
            retryable: true,
          },
        ),
        onStateChange,
      );
    }

    const result = await services.intake.getValidatedResult(extraction.id);
    if (!result) {
      return emit(
        failedState(state, "review", {
          code: "extraction_failed",
          message: "Extraction result is not ready",
          retryable: true,
        }),
        onStateChange,
      );
    }
    return emit(
      { ...state, status: "awaiting_review", failure: null, retryFrom: null },
      onStateChange,
    );
  } catch (error) {
    return emit(failedState(state, "extraction", error), onStateChange);
  }
}

export async function confirmIntakeWorkflow({
  services,
  extractionId,
  result,
  onStateChange,
}: ConfirmIntakeWorkflowInput): Promise<IntakeWorkflowState> {
  const operationId = `confirm:${extractionId}`;
  const confirmed = confirmedOperations.get(operationId);
  if (confirmed) return { ...confirmed, replayed: true };

  const existing = confirmationOperations.get(operationId);
  if (existing) {
    const state = await existing;
    return { ...state, replayed: true };
  }

  const state: IntakeWorkflowState = {
    operationId,
    attempt: (confirmationAttempts.get(operationId) ?? 0) + 1,
    status: "confirming",
    uploadId: null,
    extractionId,
    confirmation: null,
    failure: null,
    retryFrom: null,
    replayed: false,
  };
  confirmationAttempts.set(operationId, state.attempt);
  emit(state, onStateChange);
  const operation = (async () => {
    try {
      const confirmation = await services.intake.confirm({ extractionId, result });
      const completed = emit(
        { ...state, status: "confirmed", confirmation },
        onStateChange,
      );
      confirmedOperations.set(operationId, completed);
      return completed;
    } catch (error) {
      return emit(
        failedState(state, "confirmation", error),
        onStateChange,
      );
    } finally {
      confirmationOperations.delete(operationId);
    }
  })();
  confirmationOperations.set(operationId, operation);
  return operation;
}
