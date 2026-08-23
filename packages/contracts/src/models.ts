import type { AIExtractionResult } from "./ai-extraction.ts";
import type {
  AIExtractionStatus,
  ClientStatus,
  ProjectStatus,
  TaskStatus,
  UploadStatus,
} from "./statuses.ts";

export type EntityId = string;
export type ISODateTime = string;
export type ISODate = string;

export interface Client {
  id: EntityId;
  userId: EntityId;
  name: string;
  contactHandle: string | null;
  contactChannel: string | null;
  notes: string | null;
  status: ClientStatus;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
export interface Project {
  id: EntityId;
  userId: EntityId;
  clientId: EntityId;
  name: string;
  summary: string | null;
  budgetAmount: number | null;
  budgetCurrency: string | null;
  dueDate: ISODate | null;
  status: ProjectStatus;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Requirement {
  id: EntityId;
  userId: EntityId;
  projectId: EntityId;
  content: string;
  sortOrder: number;
  sourceExtractionId: EntityId | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Task {
  id: EntityId;
  userId: EntityId;
  projectId: EntityId;
  requirementId: EntityId | null;
  title: string;
  description: string | null;
  dueAt: ISODateTime | null;
  sortOrder: number;
  status: TaskStatus;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Upload {
  id: EntityId;
  userId: EntityId;
  storagePath: string;
  mimeType: string;
  byteSize: number;
  status: UploadStatus;
  errorCode: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface AIExtraction {
  id: EntityId;
  userId: EntityId;
  uploadId: EntityId;
  status: AIExtractionStatus;
  schemaVersion: number;
  provider: string | null;
  model: string | null;
  result: AIExtractionResult | null;
  errorCode: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
