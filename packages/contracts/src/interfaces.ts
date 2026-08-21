import type { AIExtractionResult } from "./ai-extraction";
import type {
  ConfirmExtractionInput,
  ConfirmExtractionResult,
  CreateClientInput,
  CreateProjectInput,
  PrepareUploadInput,
  PrepareUploadResult,
  UpdateClientInput,
  UpdateProjectInput,
} from "./inputs";
import type {
  AIExtraction,
  Client,
  EntityId,
  Project,
  Requirement,
  Task,
  Upload,
} from "./models";

export interface ClientRepository {
  list(): Promise<Client[]>;
  getById(id: EntityId): Promise<Client | null>;
  create(input: CreateClientInput): Promise<Client>;
  update(id: EntityId, input: UpdateClientInput): Promise<Client>;
}

export interface ProjectRepository {
  listByClient(clientId: EntityId): Promise<Project[]>;
  getById(id: EntityId): Promise<Project | null>;
  create(input: CreateProjectInput): Promise<Project>;
  update(id: EntityId, input: UpdateProjectInput): Promise<Project>;
}

export interface RequirementRepository {
  listByProject(projectId: EntityId): Promise<Requirement[]>;
}

export interface TaskRepository {
  listByProject(projectId: EntityId): Promise<Task[]>;
}

export interface UploadRepository {
  getById(id: EntityId): Promise<Upload | null>;
  prepare(input: PrepareUploadInput): Promise<PrepareUploadResult>;
  markUploaded(id: EntityId): Promise<Upload>;
}

export interface AIExtractionRepository {
  getById(id: EntityId): Promise<AIExtraction | null>;
  start(uploadId: EntityId): Promise<AIExtraction>;
}

export interface AIProvider {
  extractScreenshot(input: {
    mimeType: string;
    imageBytes: Uint8Array;
  }): Promise<unknown>;
}

export interface IntakeService {
  requestExtraction(uploadId: EntityId): Promise<AIExtraction>;
  getValidatedResult(extractionId: EntityId): Promise<AIExtractionResult | null>;
  confirm(input: ConfirmExtractionInput): Promise<ConfirmExtractionResult>;
}
