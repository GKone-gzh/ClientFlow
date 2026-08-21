export const CONTRACT_ERROR_CODES = [
  "unauthenticated",
  "forbidden",
  "not_found",
  "validation_failed",
  "conflict",
  "upload_failed",
  "extraction_failed",
  "rate_limited",
  "internal_error",
] as const;

export type ContractErrorCode = (typeof CONTRACT_ERROR_CODES)[number];

export interface ContractErrorShape {
  code: ContractErrorCode;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}
