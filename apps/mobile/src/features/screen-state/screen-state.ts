import { isContractErrorShape } from "@/services/service-error";

export type CollectionScreenState =
  | "initial-loading"
  | "empty"
  | "loaded"
  | "refreshing"
  | "error"
  | "cached-error"
  | "loading-more"
  | "load-more-error";

export function resolveCollectionScreenState(input: {
  hasData: boolean;
  isError: boolean;
  isFetching: boolean;
  isLoadingMore?: boolean;
  itemCount: number;
  loadMoreError?: boolean;
}) : CollectionScreenState {
  if (!input.hasData) {
    if (input.isError) return "error";
    return "initial-loading";
  }
  if (input.loadMoreError) return "load-more-error";
  if (input.isLoadingMore) return "loading-more";
  if (input.isError) return "cached-error";
  if (input.isFetching) return "refreshing";
  if (input.itemCount === 0) return "empty";
  return "loaded";
}

export type HomeScreenState =
  | "initial-loading"
  | "empty"
  | "partial"
  | "loaded"
  | "refreshing"
  | "error"
  | "cached-error";

export function resolveHomeScreenState(input: {
  hasClients: boolean;
  hasTasks: boolean;
  isError: boolean;
  isFetching: boolean;
  totalItems: number;
}): HomeScreenState {
  const hasAnyData = input.hasClients || input.hasTasks;
  if (!hasAnyData) return input.isError ? "error" : "initial-loading";
  if (input.isError) return "cached-error";
  if (!input.hasClients || !input.hasTasks) return "partial";
  if (input.isFetching) return "refreshing";
  if (input.totalItems === 0) return "empty";
  return "loaded";
}

export type ClientDetailScreenState =
  | "initial-loading"
  | "not-found"
  | "forbidden"
  | "error"
  | "cached-error"
  | "section-loading"
  | "section-error"
  | "refreshing"
  | "loaded";

export function resolveClientDetailScreenState(input: {
  error: unknown;
  hasData: boolean;
  isFetching: boolean;
  isNotFound: boolean;
  isPlaceholderData: boolean;
  sectionError?: boolean;
}): ClientDetailScreenState {
  if (input.isNotFound) return "not-found";
  if (!input.hasData) {
    if (!input.error) return "initial-loading";
    if (isContractErrorShape(input.error)) {
      if (input.error.code === "forbidden") return "forbidden";
      if (input.error.code === "not_found") return "not-found";
    }
    return "error";
  }
  if (input.sectionError) return "section-error";
  if (input.error) return "cached-error";
  if (input.isPlaceholderData) return "section-loading";
  if (input.isFetching) return "refreshing";
  return "loaded";
}

export type IntakeScreenState =
  | "idle"
  | "selecting"
  | "compressing"
  | "uploading"
  | "uploaded"
  | "processing"
  | "needs-review"
  | "confirming"
  | "confirmed"
  | "failed";

export function resolveIntakeScreenState(stage: string): IntakeScreenState {
  if (stage === "extracting") return "processing";
  if (stage === "awaiting_review" || stage === "success") return "needs-review";
  if (
    stage === "idle" ||
    stage === "selecting" ||
    stage === "compressing" ||
    stage === "uploading" ||
    stage === "uploaded" ||
    stage === "confirming" ||
    stage === "confirmed" ||
    stage === "failed"
  ) {
    return stage;
  }
  return "failed";
}

export type ReviewScreenState =
  | "initial-loading"
  | "ready"
  | "not-found"
  | "error"
  | "confirming"
  | "confirm-error"
  | "confirmed";

export function resolveReviewScreenState(input: {
  confirmError: boolean;
  hasResult: boolean;
  isConfirming: boolean;
  isConfirmed: boolean;
  isResultError: boolean;
  resultIsNull: boolean;
}): ReviewScreenState {
  if (input.isConfirmed) return "confirmed";
  if (input.isConfirming) return "confirming";
  if (input.confirmError) return "confirm-error";
  if (input.resultIsNull) return "not-found";
  if (input.isResultError) return "error";
  if (!input.hasResult) return "initial-loading";
  return "ready";
}

export type AuthRestoreScreenState = "restoring" | "error" | "ready";

export function resolveAuthRestoreScreenState(input: {
  hasError: boolean;
  isRestoring: boolean;
}): AuthRestoreScreenState {
  if (input.isRestoring) return "restoring";
  if (input.hasError) return "error";
  return "ready";
}

export type MutationScreenState = "idle" | "submitting" | "error" | "success";

export function resolveMutationScreenState(input: {
  isError: boolean;
  isPending: boolean;
  isSuccess: boolean;
}): MutationScreenState {
  if (input.isPending) return "submitting";
  if (input.isError) return "error";
  if (input.isSuccess) return "success";
  return "idle";
}
