import {
  AIExtractionResultSchema,
  type AIExtraction,
  type Client,
  type Project,
  type Requirement,
  type Task,
  type Upload,
} from "@clientflow/contracts";

import { BackendError } from "./errors.ts";

type Row = Record<string, unknown>;

export function mapClient(row: Row): Client {
  return {
    id: stringValue(row.id),
    userId: stringValue(row.user_id),
    name: stringValue(row.name),
    contactHandle: nullableString(row.contact_handle),
    contactChannel: nullableString(row.contact_channel),
    notes: nullableString(row.notes),
    status: row.status as Client["status"],
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at),
  };
}

export function mapProject(row: Row): Project {
  return {
    id: stringValue(row.id),
    userId: stringValue(row.user_id),
    clientId: stringValue(row.client_id),
    name: stringValue(row.name),
    summary: nullableString(row.summary),
    budgetAmount:
      row.budget_amount === null ? null : Number(row.budget_amount),
    budgetCurrency: nullableString(row.budget_currency),
    dueDate: nullableString(row.due_date),
    status: row.status as Project["status"],
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at),
  };
}

export function mapRequirement(row: Row): Requirement {
  return {
    id: stringValue(row.id),
    userId: stringValue(row.user_id),
    projectId: stringValue(row.project_id),
    content: stringValue(row.content),
    sortOrder: numberValue(row.sort_order),
    sourceExtractionId: nullableString(row.source_extraction_id),
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at),
  };
}

export function mapTask(row: Row): Task {
  return {
    id: stringValue(row.id),
    userId: stringValue(row.user_id),
    projectId: stringValue(row.project_id),
    requirementId: nullableString(row.requirement_id),
    title: stringValue(row.title),
    description: nullableString(row.description),
    dueAt: nullableString(row.due_at),
    sortOrder: numberValue(row.sort_order),
    status: row.status as Task["status"],
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at),
  };
}

export function mapUpload(row: Row): Upload {
  return {
    id: stringValue(row.id),
    userId: stringValue(row.user_id),
    storagePath: stringValue(row.storage_path),
    mimeType: stringValue(row.mime_type),
    byteSize: numberValue(row.byte_size),
    status: row.status as Upload["status"],
    errorCode: nullableString(row.error_code),
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at),
  };
}

export function mapExtraction(row: Row): AIExtraction {
  const parsedResult =
    row.result === null || row.result === undefined
      ? null
      : AIExtractionResultSchema.safeParse(row.result);

  if (parsedResult !== null && !parsedResult.success) {
    throw new BackendError({
      code: "extraction_failed",
      message: "Stored extraction data failed schema validation",
      status: 500,
    });
  }

  return {
    id: stringValue(row.id),
    userId: stringValue(row.user_id),
    uploadId: stringValue(row.upload_id),
    status: row.status as AIExtraction["status"],
    schemaVersion: numberValue(row.schema_version),
    provider: nullableString(row.provider),
    model: nullableString(row.model),
    result: parsedResult === null ? null : parsedResult.data,
    errorCode: nullableString(row.error_code),
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at),
  };
}

function stringValue(value: unknown): string {
  if (typeof value !== "string") {
    throw invalidRow();
  }
  return value;
}

function nullableString(value: unknown): string | null {
  if (value === null) {
    return null;
  }
  return stringValue(value);
}

function numberValue(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) {
    throw invalidRow();
  }
  return number;
}

function invalidRow(): BackendError {
  return new BackendError({
    code: "internal_error",
    message: "The database returned an invalid record",
    status: 500,
  });
}
