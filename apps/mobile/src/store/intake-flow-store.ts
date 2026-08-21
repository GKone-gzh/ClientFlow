import { create } from "zustand";

import type { IntakeWorkflowState } from "@/features/intake/intake-workflow";
import type { PreparedScreenshot } from "@/services/images/screenshot-service";

export type IntakeStage =
  | "idle"
  | "selecting"
  | "compressing"
  | IntakeWorkflowState["status"]
  | "success";

interface IntakeFlowState {
  error: IntakeWorkflowState["failure"] | null;
  extractionId: string | null;
  operationId: string | null;
  screenshot: PreparedScreenshot | null;
  stage: IntakeStage;
  workflow: IntakeWorkflowState | null;
  reset: () => void;
  setError: (error: IntakeWorkflowState["failure"]) => void;
  setScreenshot: (
    screenshot: PreparedScreenshot | null,
    operationId?: string | null,
  ) => void;
  setStage: (stage: IntakeStage) => void;
  setWorkflow: (workflow: IntakeWorkflowState) => void;
}

const INITIAL_STATE = {
  error: null,
  extractionId: null,
  operationId: null,
  screenshot: null,
  stage: "idle" as const,
  workflow: null,
};

export const useIntakeFlowStore = create<IntakeFlowState>((set) => ({
  ...INITIAL_STATE,
  reset: () => set(INITIAL_STATE),
  setError: (error) => set({ error, stage: "failed" }),
  setScreenshot: (screenshot, operationId = null) =>
    set({
      error: null,
      extractionId: null,
      operationId,
      screenshot,
      workflow: null,
    }),
  setStage: (stage) => set({ error: null, stage }),
  setWorkflow: (workflow) =>
    set({
      error: workflow.failure,
      extractionId: workflow.extractionId,
      operationId: workflow.operationId,
      stage:
        workflow.status === "awaiting_review" ? "success" : workflow.status,
      workflow,
    }),
}));
