import {
  ConfirmExtractionInputSchema,
  GetExtractionInputSchema,
  MarkUploadedInputSchema,
  PrepareUploadInputSchema,
  RequestExtractionInputSchema,
  type AIExtraction,
  type ConfirmExtractionInput,
  type ConfirmExtractionResult,
  type GetExtractionInput,
  type MarkUploadedInput,
  type PrepareUploadInput,
  type PrepareUploadResult,
  type RequestExtractionInput,
  type Upload,
} from "@clientflow/contracts";
import { z } from "zod";

import { BackendError } from "./errors.ts";
import {
  edgeLogger,
  type SafeLogger,
} from "./safe-logger.ts";

const JSON_HEADERS = {
  "access-control-allow-headers":
    "authorization, apikey, content-type, x-request-id",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-origin": "*",
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
};

export interface BackendFacade {
  confirmExtraction(
    input: ConfirmExtractionInput,
  ): Promise<ConfirmExtractionResult>;
  getExtraction(input: GetExtractionInput): Promise<AIExtraction>;
  markUploaded(input: MarkUploadedInput): Promise<Upload>;
  prepareUpload(input: PrepareUploadInput): Promise<PrepareUploadResult>;
  requestExtraction(input: RequestExtractionInput): Promise<AIExtraction>;
}

export interface RequestContext {
  requestId: string;
}

export type BackendFactory = (
  request: Request,
  context: RequestContext,
) => Promise<BackendFacade>;

export function createPrepareUploadHandler(
  createBackend: BackendFactory,
  logger: SafeLogger = edgeLogger,
): (request: Request) => Promise<Response> {
  return createJsonHandler(
    PrepareUploadInputSchema,
    createBackend,
    (backend, input) => backend.prepareUpload(input),
    "prepare-upload",
    logger,
  );
}

export function createMarkUploadedHandler(
  createBackend: BackendFactory,
  logger: SafeLogger = edgeLogger,
): (request: Request) => Promise<Response> {
  return createJsonHandler(
    MarkUploadedInputSchema,
    createBackend,
    (backend, input) => backend.markUploaded(input),
    "mark-uploaded",
    logger,
  );
}

export function createRequestExtractionHandler(
  createBackend: BackendFactory,
  logger: SafeLogger = edgeLogger,
): (request: Request) => Promise<Response> {
  return createJsonHandler(
    RequestExtractionInputSchema,
    createBackend,
    (backend, input) => backend.requestExtraction(input),
    "request-extraction",
    logger,
  );
}

export function createGetExtractionHandler(
  createBackend: BackendFactory,
  logger: SafeLogger = edgeLogger,
): (request: Request) => Promise<Response> {
  return createJsonHandler(
    GetExtractionInputSchema,
    createBackend,
    (backend, input) => backend.getExtraction(input),
    "get-extraction",
    logger,
  );
}

export function createConfirmExtractionHandler(
  createBackend: BackendFactory,
  logger: SafeLogger = edgeLogger,
): (request: Request) => Promise<Response> {
  return createJsonHandler(
    ConfirmExtractionInputSchema,
    createBackend,
    (backend, input) => backend.confirmExtraction(input),
    "confirm-extraction",
    logger,
  );
}

function createJsonHandler<Input, Output>(
  schema: z.ZodType<Input>,
  createBackend: BackendFactory,
  action: (backend: BackendFacade, input: Input) => Promise<Output>,
  operation: string,
  logger: SafeLogger,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const requestId = resolveRequestId(request.headers.get("x-request-id"));
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: responseHeaders(requestId),
        status: 204,
      });
    }

    if (request.method !== "POST") {
      return errorResponse(
        new BackendError({
          code: "validation_failed",
          message: "Only POST requests are supported",
          status: 405,
        }),
        requestId,
      );
    }

    try {
      const backend = await createBackend(request, { requestId });
      const input = schema.parse(await readJson(request));
      const output = await action(backend, input);
      logger.log({ operation, requestId, status: "succeeded" });
      return jsonResponse(output, 200, requestId);
    } catch (error) {
      const normalized = normalizeError(error);
      logger.log({
        operation,
        requestId,
        status: "failed",
        errorCode: normalized.code,
      });
      return errorResponse(normalized, requestId);
    }
  };
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return (await request.json()) as unknown;
  } catch (error) {
    throw new BackendError({
      code: "validation_failed",
      message: "The request body must be valid JSON",
      status: 400,
      cause: error,
    });
  }
}

function normalizeError(error: unknown): BackendError {
  if (error instanceof BackendError) {
    return error;
  }

  if (error instanceof z.ZodError) {
    return new BackendError({
      code: "validation_failed",
      message: "The request payload is invalid",
      status: 400,
      details: { fields: error.issues.map((issue) => issue.path.join(".")) },
    });
  }

  return new BackendError({
    code: "internal_error",
    message: "An unexpected server error occurred",
    retryable: true,
    status: 500,
    cause: error,
  });
}

function errorResponse(error: BackendError, requestId: string): Response {
  const contract = error.toContract();
  return jsonResponse(
    {
      ...contract,
      details: { ...contract.details, requestId },
    },
    error.status,
    requestId,
  );
}

function jsonResponse(value: unknown, status: number, requestId: string): Response {
  return new Response(JSON.stringify(value), {
    headers: responseHeaders(requestId),
    status,
  });
}

function responseHeaders(requestId: string) {
  return { ...JSON_HEADERS, "x-request-id": requestId };
}

function resolveRequestId(value: string | null) {
  if (
    value !== null &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    return value.toLowerCase();
  }
  return crypto.randomUUID();
}
