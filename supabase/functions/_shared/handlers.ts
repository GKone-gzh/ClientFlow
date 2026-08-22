import {
  ConfirmExtractionInputSchema,
  GetExtractionInputSchema,
  PrepareUploadInputSchema,
  RequestExtractionInputSchema,
  type AIExtraction,
  type ConfirmExtractionInput,
  type ConfirmExtractionResult,
  type GetExtractionInput,
  type PrepareUploadInput,
  type PrepareUploadResult,
  type RequestExtractionInput,
} from "@clientflow/contracts";
import { z } from "zod";

import { BackendError } from "./errors.ts";

const JSON_HEADERS = {
  "access-control-allow-headers": "authorization, apikey, content-type",
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
  prepareUpload(input: PrepareUploadInput): Promise<PrepareUploadResult>;
  requestExtraction(input: RequestExtractionInput): Promise<AIExtraction>;
}

export type BackendFactory = (request: Request) => Promise<BackendFacade>;

export function createPrepareUploadHandler(
  createBackend: BackendFactory,
): (request: Request) => Promise<Response> {
  return createJsonHandler(
    PrepareUploadInputSchema,
    createBackend,
    (backend, input) => backend.prepareUpload(input),
  );
}

export function createRequestExtractionHandler(
  createBackend: BackendFactory,
): (request: Request) => Promise<Response> {
  return createJsonHandler(
    RequestExtractionInputSchema,
    createBackend,
    (backend, input) => backend.requestExtraction(input),
  );
}

export function createGetExtractionHandler(
  createBackend: BackendFactory,
): (request: Request) => Promise<Response> {
  return createJsonHandler(
    GetExtractionInputSchema,
    createBackend,
    (backend, input) => backend.getExtraction(input),
  );
}

export function createConfirmExtractionHandler(
  createBackend: BackendFactory,
): (request: Request) => Promise<Response> {
  return createJsonHandler(
    ConfirmExtractionInputSchema,
    createBackend,
    (backend, input) => backend.confirmExtraction(input),
  );
}

function createJsonHandler<Input, Output>(
  schema: z.ZodType<Input>,
  createBackend: BackendFactory,
  action: (backend: BackendFacade, input: Input) => Promise<Output>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: JSON_HEADERS, status: 204 });
    }

    if (request.method !== "POST") {
      return errorResponse(
        new BackendError({
          code: "validation_failed",
          message: "Only POST requests are supported",
          status: 405,
        }),
      );
    }

    try {
      const input = schema.parse(await readJson(request));
      const backend = await createBackend(request);
      const output = await action(backend, input);
      return jsonResponse(output, 200);
    } catch (error) {
      return errorResponse(normalizeError(error));
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

function errorResponse(error: BackendError): Response {
  return jsonResponse(error.toContract(), error.status);
}

function jsonResponse(value: unknown, status: number): Response {
  return new Response(JSON.stringify(value), {
    headers: JSON_HEADERS,
    status,
  });
}
