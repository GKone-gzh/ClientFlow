import {
  CONTRACT_ERROR_CODES,
  type ContractErrorCode,
  type ContractErrorShape,
} from "@clientflow/contracts";

export class AppServiceError extends Error implements ContractErrorShape {
  constructor(
    readonly code: ContractErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppServiceError";
  }
}

export function isContractErrorShape(error: unknown): error is ContractErrorShape {
  if (!error || typeof error !== "object") return false;
  const candidate = error as Partial<ContractErrorShape>;
  return (
    typeof candidate.code === "string" &&
    CONTRACT_ERROR_CODES.includes(candidate.code as ContractErrorCode) &&
    typeof candidate.message === "string" &&
    typeof candidate.retryable === "boolean"
  );
}

export function toContractError(
  error: unknown,
  fallback: Pick<ContractErrorShape, "code" | "message" | "retryable">,
): ContractErrorShape {
  if (isContractErrorShape(error)) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      ...(error.details ? { details: error.details } : {}),
    };
  }
  return { ...fallback };
}
