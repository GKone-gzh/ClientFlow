import type {
  ContractErrorCode,
  ContractErrorShape,
} from "@clientflow/contracts";

export class BackendError extends Error {
  readonly code: ContractErrorCode;
  readonly retryable: boolean;
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(options: {
    code: ContractErrorCode;
    message: string;
    retryable?: boolean;
    status: number;
    details?: Record<string, unknown>;
    cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = "BackendError";
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.status = options.status;
    this.details = options.details;
  }

  toContract(): ContractErrorShape {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      ...(this.details === undefined ? {} : { details: this.details }),
    };
  }
}

export function databaseError(
  error: unknown,
  fallbackMessage: string,
): BackendError {
  const code = getErrorCode(error);

  if (code === "PGRST116" || code === "P0002") {
    return new BackendError({
      code: "not_found",
      message: "The requested resource was not found",
      status: 404,
      cause: error,
    });
  }

  if (code === "23505" || code === "40001" || code === "409") {
    return new BackendError({
      code: "conflict",
      message: "The request conflicts with existing data",
      retryable: code === "40001",
      status: 409,
      cause: error,
    });
  }

  if (code === "CF001") {
    return new BackendError({
      code: "rate_limited",
      message: "The AI request rate limit was reached",
      retryable: true,
      status: 429,
      cause: error,
    });
  }

  if (code === "CF002") {
    return new BackendError({
      code: "quota_exceeded",
      message: "The daily AI request quota was reached",
      retryable: false,
      status: 429,
      cause: error,
    });
  }

  if (code === "CF003" || code === "CF004") {
    return new BackendError({
      code: "conflict",
      message: "The extraction cannot be started in its current state",
      retryable: code === "CF003",
      status: 409,
      cause: error,
    });
  }

  if (code === "22023" || code === "P0001") {
    return new BackendError({
      code: "validation_failed",
      message: "The request failed server validation",
      status: 400,
      cause: error,
    });
  }

  return new BackendError({
    code: "internal_error",
    message: fallbackMessage,
    retryable: true,
    status: 500,
    cause: error,
  });
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }

  return typeof error.code === "string" ? error.code : undefined;
}
