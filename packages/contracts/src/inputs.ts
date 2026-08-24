import { z } from "zod";

import { AIExtractionResultSchema } from "./ai-extraction.ts";
import type {
  AIExtraction,
  Client,
  EntityId,
  ISODate,
  ISODateTime,
  Project,
  Requirement,
  Task,
  Upload,
} from "./models.ts";
import {
  AIExtractionStatusSchema,
  ClientStatusSchema,
  ProjectStatusSchema,
  TaskStatusSchema,
  UploadStatusSchema,
  type ClientStatus,
  type ProjectStatus,
  type TaskStatus,
} from "./statuses.ts";

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

const ISODateTimeSchema = z.string().datetime({ offset: true });
const NullableTextSchema = z.string().nullable();

export const AIExtractionSchema: z.ZodType<AIExtraction> = z
  .object({
    id: EntityIdSchema,
    userId: EntityIdSchema,
    uploadId: EntityIdSchema,
    status: AIExtractionStatusSchema,
    schemaVersion: z.number().int().positive(),
    provider: NullableTextSchema,
    model: NullableTextSchema,
    result: AIExtractionResultSchema.nullable(),
    errorCode: NullableTextSchema,
    createdAt: ISODateTimeSchema,
    updatedAt: ISODateTimeSchema,
  })
  .strict();

export const ConfirmExtractionResultSchema: z.ZodType<ConfirmExtractionResult> =
  z
    .object({
      clientId: EntityIdSchema,
      projectId: EntityIdSchema,
      requirementIds: z.array(EntityIdSchema),
      taskIds: z.array(EntityIdSchema),
    })
    .strict();

export const ClientSchema: z.ZodType<Client> = z
  .object({
    id: EntityIdSchema,
    userId: EntityIdSchema,
    name: z.string().trim().min(1),
    contactHandle: NullableTextSchema,
    contactChannel: NullableTextSchema,
    notes: NullableTextSchema,
    status: ClientStatusSchema,
    createdAt: ISODateTimeSchema,
    updatedAt: ISODateTimeSchema,
  })
  .strict();

export const ProjectSchema: z.ZodType<Project> = z
  .object({
    id: EntityIdSchema,
    userId: EntityIdSchema,
    clientId: EntityIdSchema,
    name: z.string().trim().min(1),
    summary: NullableTextSchema,
    budgetAmount: z.number().finite().nonnegative().nullable(),
    budgetCurrency: z.string().length(3).nullable(),
    dueDate: z.string().date().nullable(),
    status: ProjectStatusSchema,
    createdAt: ISODateTimeSchema,
    updatedAt: ISODateTimeSchema,
  })
  .strict();

export const RequirementSchema: z.ZodType<Requirement> = z
  .object({
    id: EntityIdSchema,
    userId: EntityIdSchema,
    projectId: EntityIdSchema,
    content: z.string().trim().min(1),
    sortOrder: z.number().int().nonnegative(),
    sourceExtractionId: EntityIdSchema.nullable(),
    createdAt: ISODateTimeSchema,
    updatedAt: ISODateTimeSchema,
  })
  .strict();

export const TaskSchema = z
  .object({
    id: EntityIdSchema,
    userId: EntityIdSchema,
    projectId: EntityIdSchema,
    requirementId: EntityIdSchema.nullable(),
    title: z.string().trim().min(1),
    description: NullableTextSchema,
    dueAt: ISODateTimeSchema.nullable(),
    sortOrder: z.number().int().nonnegative(),
    status: TaskStatusSchema,
    createdAt: ISODateTimeSchema,
    updatedAt: ISODateTimeSchema,
  })
  .strict() satisfies z.ZodType<Task>;
