import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveAuthRestoreScreenState,
  resolveClientDetailScreenState,
  resolveCollectionScreenState,
  resolveHomeScreenState,
  resolveIntakeScreenState,
  resolveMutationScreenState,
  resolveReviewScreenState,
} from "./screen-state";
import { AppServiceError } from "@/services/service-error";

test("resolves collection initial, empty, refresh, cached error, and paging states", () => {
  assert.equal(collection({ hasData: false }), "initial-loading");
  assert.equal(collection({ hasData: false, isError: true }), "error");
  assert.equal(collection({ hasData: true }), "empty");
  assert.equal(
    collection({ hasData: true, itemCount: 3, isFetching: true }),
    "refreshing",
  );
  assert.equal(
    collection({ hasData: true, itemCount: 3, isError: true }),
    "cached-error",
  );
  assert.equal(
    collection({ hasData: true, itemCount: 3, isLoadingMore: true }),
    "loading-more",
  );
  assert.equal(
    collection({ hasData: true, itemCount: 3, loadMoreError: true }),
    "load-more-error",
  );
});

test("resolves partial and cached-error dashboard states", () => {
  assert.equal(
    resolveHomeScreenState({
      hasClients: true,
      hasTasks: false,
      isError: false,
      isFetching: true,
      totalItems: 2,
    }),
    "partial",
  );
  assert.equal(
    resolveHomeScreenState({
      hasClients: true,
      hasTasks: true,
      isError: true,
      isFetching: false,
      totalItems: 2,
    }),
    "cached-error",
  );
});

test("resolves client detail permission, cache, and section states", () => {
  assert.equal(
    detail({ error: new AppServiceError("forbidden", "Denied", false) }),
    "forbidden",
  );
  assert.equal(detail({ isNotFound: true }), "not-found");
  assert.equal(
    detail({ hasData: true, isPlaceholderData: true }),
    "section-loading",
  );
  assert.equal(detail({ hasData: true, sectionError: true }), "section-error");
  assert.equal(
    detail({ hasData: true, error: new Error("refresh") }),
    "cached-error",
  );
});

test("maps intake implementation stages to stable UI behavior", () => {
  assert.equal(resolveIntakeScreenState("extracting"), "processing");
  assert.equal(resolveIntakeScreenState("awaiting_review"), "needs-review");
  assert.equal(resolveIntakeScreenState("uploading"), "uploading");
  assert.equal(resolveIntakeScreenState("failed"), "failed");
});

test("resolves review, auth restore, and mutation states", () => {
  assert.equal(review({}), "initial-loading");
  assert.equal(review({ hasResult: true }), "ready");
  assert.equal(review({ hasResult: true, isConfirming: true }), "confirming");
  assert.equal(review({ hasResult: true, confirmError: true }), "confirm-error");
  assert.equal(
    resolveAuthRestoreScreenState({ hasError: false, isRestoring: true }),
    "restoring",
  );
  assert.equal(
    resolveAuthRestoreScreenState({ hasError: true, isRestoring: false }),
    "error",
  );
  assert.equal(
    resolveMutationScreenState({
      isError: false,
      isPending: true,
      isSuccess: false,
    }),
    "submitting",
  );
});

function collection(
  overrides: Partial<Parameters<typeof resolveCollectionScreenState>[0]>,
) {
  return resolveCollectionScreenState({
    hasData: false,
    isError: false,
    isFetching: false,
    itemCount: 0,
    ...overrides,
  });
}

function detail(
  overrides: Partial<Parameters<typeof resolveClientDetailScreenState>[0]>,
) {
  return resolveClientDetailScreenState({
    error: null,
    hasData: false,
    isFetching: false,
    isNotFound: false,
    isPlaceholderData: false,
    ...overrides,
  });
}

function review(
  overrides: Partial<Parameters<typeof resolveReviewScreenState>[0]>,
) {
  return resolveReviewScreenState({
    confirmError: false,
    hasResult: false,
    isConfirmed: false,
    isConfirming: false,
    isResultError: false,
    resultIsNull: false,
    ...overrides,
  });
}
