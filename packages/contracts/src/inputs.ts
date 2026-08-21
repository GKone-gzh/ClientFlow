import type { AIExtractionResult } from "./ai-extraction";
import type { EntityId, ISODate, ISODateTime } from "./models";
import type { ClientStatus, ProjectStatus, TaskStatus } from "./statuses";

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

export interface PrepareUploadInput {
  mimeType: string;
  byteSize: number;
  originalFileName: string;
}

export interface PrepareUploadResult {
  uploadId: EntityId;
  storagePath: string;
  signedUploadToken: string;
}

export interface ConfirmExtractionInput {
  extractionId: EntityId;
  result: AIExtractionResult;
}

export interface ConfirmExtractionResult {
  clientId: EntityId;
  projectId: EntityId;
  requirementIds: EntityId[];
  taskIds: EntityId[];
}
