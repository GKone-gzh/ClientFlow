import { create } from "zustand";

import type { MockAIScenario } from "@/services/ai/mock-ai-provider";
import type { PreparedScreenshot } from "@/services/images/screenshot-service";

export type IntakeStage =
  | "idle"
  | "selecting"
  | "compressing"
  | "uploading"
  | "processing"
  | "success"
  | "failed";

export interface IntakeFlowError {
  code: string;
  message: string;
  retryable: boolean;
}

interface IntakeFlowState {
  error: IntakeFlowError | null;
  extractionId: string | null;
  lastScenario: MockAIScenario;
  screenshot: PreparedScreenshot | null;
  stage: IntakeStage;
  reset: () => void;
  setError: (error: IntakeFlowError) => void;
  setExtractionId: (extractionId: string) => void;
  setScenario: (scenario: MockAIScenario) => void;
  setScreenshot: (screenshot: PreparedScreenshot | null) => void;
  setStage: (stage: IntakeStage) => void;
}

const INITIAL_STATE = {
  error: null,
  extractionId: null,
  lastScenario: "complete" as const,
  screenshot: null,
  stage: "idle" as const,
};

export const useIntakeFlowStore = create<IntakeFlowState>((set) => ({
  ...INITIAL_STATE,
  reset: () => set(INITIAL_STATE),
  setError: (error) => set({ error, stage: "failed" }),
  setExtractionId: (extractionId) =>
    set({ error: null, extractionId, stage: "success" }),
  setScenario: (lastScenario) => set({ lastScenario }),
  setScreenshot: (screenshot) => set({ error: null, screenshot }),
  setStage: (stage) => set({ error: null, stage }),
}));
