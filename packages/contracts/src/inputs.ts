import { z } from "zod";

import { AIExtractionResultSchema } from "./ai-extraction";
import type { EntityId, ISODate, ISODateTime, Upload } from "./models";
import {
  UploadStatusSchema,
  type ClientStatus,
  type ProjectStatus,
  type TaskStatus,
} from "./statuses";

export const EntityIdSchema = z.string().uuid();

export interface CreateClientInput {
  name: string;
  contactHandle: string | null;
  contactChannel: string | null;
  notes: string | null;
  status: ClientStatus;
}

export interface UpdateClientInput {
  name?: string;
  contactHandle?: string | null;
  contactChannel?: string | null;
  notes?: string | null;
  status?: ClientStatus;
}

export interface CreateProjectInput {
  clientId: EntityId;
  name: string;
  summary: string | null;
  budgetAmount: number | null;
  budgetCurrency: string | null;
  dueDate: ISODate | null;
  status: ProjectStatus;
}

export interface UpdateProjectInput {
  name?: string;
  summary?: string | null;
  budgetAmount?: number | null;
  budgetCurrency?: string | null;
  dueDate?: ISODate | null;
  status?: ProjectStatus;
}

export interface CreateRequirementInput {
  projectId: EntityId;
  content: string;
  sortOrder: number;
  sourceExtractionId: EntityId | null;
}

export interface CreateTaskInput {
  projectId: EntityId;
  requirementId: EntityId | null;
  title: string;
  description: string | null;
  dueAt: ISODateTime | null;
  sortOrder: number;
  status: TaskStatus;
}

export const PrepareUploadInputSchema = z
  .object({
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    byteSize: z.number().int().positive().max(10 * 1024 * 1024),
    originalFileName: z.string().trim().min(1).max(255),
  })
  .strict();

export type PrepareUploadInput = z.infer<typeof PrepareUploadInputSchema>;

export interface PrepareUploadResult {
  uploadId: EntityId;
  storagePath: string;
  signedUploadToken: string;
}

export const PrepareUploadResultSchema = z
  .object({
    uploadId: EntityIdSchema,
    storagePath: z.string().min(1),
    signedUploadToken: z.string().min(1),
  })
  .strict();

export const MarkUploadedInputSchema = z
  .object({ uploadId: EntityIdSchema })
  .strict();

export type MarkUploadedInput = z.infer<typeof MarkUploadedInputSchema>;

export const UploadSchema: z.ZodType<Upload> = z
  .object({
    id: EntityIdSchema,
    userId: EntityIdSchema,
    storagePath: z.string().min(1),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    byteSize: z.number().int().positive().max(10 * 1024 * 1024),
    status: UploadStatusSchema,
    errorCode: z.string().nullable(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();

export const RequestExtractionInputSchema = z
  .object({ uploadId: EntityIdSchema })
  .strict();

export type RequestExtractionInput = z.infer<
  typeof RequestExtractionInputSchema
>;

export const GetExtractionInputSchema = z
  .object({ extractionId: EntityIdSchema })
  .strict();

export type GetExtractionInput = z.infer<typeof GetExtractionInputSchema>;

export const ConfirmExtractionInputSchema = z
  .object({
    extractionId: EntityIdSchema,
    result: AIExtractionResultSchema,
  })
  .strict();

export type ConfirmExtractionInput = z.infer<
  typeof ConfirmExtractionInputSchema
>;

export interface ConfirmExtractionResult {
  clientId: EntityId;
  projectId: EntityId;
  requirementIds: EntityId[];
  taskIds: EntityId[];
}
