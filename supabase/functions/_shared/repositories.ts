import type {
  AIExtraction,
  AIExtractionResult,
  Client,
  ClientRepository,
  ConfirmExtractionInput,
  ConfirmExtractionResult,
  CreateClientInput,
  CreateProjectInput,
  EntityId,
  Project,
  ProjectRepository,
  Requirement,
  RequirementRepository,
  Task,
  TaskRepository,
  UpdateClientInput,
  UpdateProjectInput,
} from "@clientflow/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";

import { BackendError, databaseError } from "./errors.ts";
import {
  mapClient,
  mapExtraction,
  mapProject,
  mapRequirement,
  mapTask,
} from "./mappers.ts";

const RECORD_LIMIT = 200;

export class SupabaseClientRepository implements ClientRepository {
  constructor(private readonly client: SupabaseClient) {}

  async list(): Promise<Client[]> {
    const { data, error } = await this.client
      .from("clients")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(RECORD_LIMIT);
    throwIfDatabaseError(error, "Unable to list clients");
    return (data ?? []).map(mapClient);
  }

  async getById(id: EntityId): Promise<Client | null> {
    const { data, error } = await this.client
      .from("clients")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    throwIfDatabaseError(error, "Unable to load the client");
    return data === null ? null : mapClient(data);
  }

  async create(input: CreateClientInput): Promise<Client> {
    const { data, error } = await this.client
      .from("clients")
      .insert(toClientWrite(input))
      .select("*")
      .single();
    throwIfDatabaseError(error, "Unable to create the client");
    return mapClient(requireData(data));
  }

  async update(id: EntityId, input: UpdateClientInput): Promise<Client> {
    const { data, error } = await this.client
      .from("clients")
      .update(toClientWrite(input))
      .eq("id", id)
      .select("*")
      .single();
    throwIfDatabaseError(error, "Unable to update the client");
    return mapClient(requireData(data));
  }
}

export class SupabaseProjectRepository implements ProjectRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listByClient(clientId: EntityId): Promise<Project[]> {
    const { data, error } = await this.client
      .from("projects")
      .select("*")
      .eq("client_id", clientId)
      .order("updated_at", { ascending: false })
      .limit(RECORD_LIMIT);
    throwIfDatabaseError(error, "Unable to list projects");
    return (data ?? []).map(mapProject);
  }

  async getById(id: EntityId): Promise<Project | null> {
    const { data, error } = await this.client
      .from("projects")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    throwIfDatabaseError(error, "Unable to load the project");
    return data === null ? null : mapProject(data);
  }

  async create(input: CreateProjectInput): Promise<Project> {
    const { data, error } = await this.client
      .from("projects")
      .insert(toProjectWrite(input))
      .select("*")
      .single();
    throwIfDatabaseError(error, "Unable to create the project");
    return mapProject(requireData(data));
  }

  async update(id: EntityId, input: UpdateProjectInput): Promise<Project> {
    const { data, error } = await this.client
      .from("projects")
      .update(toProjectWrite(input))
      .eq("id", id)
      .select("*")
      .single();
    throwIfDatabaseError(error, "Unable to update the project");
    return mapProject(requireData(data));
  }
}

export class SupabaseRequirementRepository implements RequirementRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listByProject(projectId: EntityId): Promise<Requirement[]> {
    const { data, error } = await this.client
      .from("requirements")
      .select("*")
      .eq("project_id", projectId)
      .order("sort_order")
      .limit(RECORD_LIMIT);
    throwIfDatabaseError(error, "Unable to list requirements");
    return (data ?? []).map(mapRequirement);
  }
}

export class SupabaseTaskRepository implements TaskRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listByProject(projectId: EntityId): Promise<Task[]> {
    const { data, error } = await this.client
      .from("tasks")
      .select("*")
      .eq("project_id", projectId)
      .order("sort_order")
      .limit(RECORD_LIMIT);
    throwIfDatabaseError(error, "Unable to list tasks");
    return (data ?? []).map(mapTask);
  }
}

export class SupabaseAIExtractionRepository {
  constructor(
    private readonly admin: SupabaseClient,
    private readonly userId: string,
  ) {}

  async getById(id: EntityId): Promise<AIExtraction | null> {
    const { data, error } = await this.admin
      .from("ai_extractions")
      .select("*")
      .eq("id", id)
      .eq("user_id", this.userId)
      .maybeSingle();
    throwIfDatabaseError(error, "Unable to load the extraction");
    return data === null ? null : mapExtraction(data);
  }

  async reserve(
    uploadId: EntityId,
    requestId: string,
    provider: string,
    model: string,
  ): Promise<{ extraction: AIExtraction; shouldInvokeProvider: boolean }> {
    const { data, error } = await this.admin.rpc("reserve_ai_extraction", {
      p_model: model,
      p_provider: provider,
      p_request_id: requestId,
      p_upload_id: uploadId,
      p_user_id: this.userId,
    });
    throwIfDatabaseError(error, "Unable to reserve the extraction");

    const row = firstRow(data);
    const extraction = await this.getById(String(row.extraction_id));
    if (extraction === null) {
      throw new BackendError({
        code: "internal_error",
        message: "The extraction reservation returned no record",
        status: 500,
      });
    }

    return {
      extraction,
      shouldInvokeProvider: row.should_invoke_provider === true,
    };
  }

  async complete(
    extractionId: EntityId,
    result: AIExtractionResult,
    usage: AIUsageMetrics,
  ): Promise<AIExtraction> {
    const { data, error } = await this.admin.rpc("complete_ai_extraction", {
      p_attempt_count: usage.attemptCount,
      p_duration_ms: usage.durationMs,
      p_extraction_id: extractionId,
      p_input_tokens: usage.inputTokens,
      p_output_tokens: usage.outputTokens,
      p_result: result,
      p_user_id: this.userId,
    });
    throwIfDatabaseError(error, "Unable to save extraction result");
    return mapExtraction(firstRow(data));
  }

  async fail(
    extractionId: EntityId,
    errorCode: string,
    usage: Pick<AIUsageMetrics, "attemptCount" | "durationMs">,
  ): Promise<void> {
    const { error } = await this.admin.rpc("fail_ai_extraction", {
      p_attempt_count: usage.attemptCount,
      p_duration_ms: usage.durationMs,
      p_error_code: errorCode,
      p_extraction_id: extractionId,
      p_user_id: this.userId,
    });
    throwIfDatabaseError(error, "Unable to record extraction failure");
  }

  async findByUpload(uploadId: EntityId): Promise<AIExtraction | null> {
    const { data, error } = await this.admin
      .from("ai_extractions")
      .select("*")
      .eq("upload_id", uploadId)
      .eq("user_id", this.userId)
      .maybeSingle();
    throwIfDatabaseError(error, "Unable to load the extraction");
    return data === null ? null : mapExtraction(data);
  }

}

export interface AIUsageMetrics {
  attemptCount: number;
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
}

export async function confirmExtractionTransaction(
  client: SupabaseClient,
  input: ConfirmExtractionInput,
): Promise<ConfirmExtractionResult> {
  const { data, error } = await client.rpc("confirm_extraction", {
    p_extraction_id: input.extractionId,
    p_result: input.result,
  });
  throwIfDatabaseError(error, "Unable to confirm the extraction");

  const row = Array.isArray(data) ? data[0] : data;
  if (row === null || row === undefined) {
    throw new BackendError({
      code: "internal_error",
      message: "The confirmation transaction returned no result",
      status: 500,
    });
  }

  return {
    clientId: String(row.client_id),
    projectId: String(row.project_id),
    requirementIds: (row.requirement_ids as unknown[]).map(String),
    taskIds: (row.task_ids as unknown[]).map(String),
  };
}

function toClientWrite(input: CreateClientInput | UpdateClientInput) {
  return {
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.contactHandle === undefined
      ? {}
      : { contact_handle: input.contactHandle }),
    ...(input.contactChannel === undefined
      ? {}
      : { contact_channel: input.contactChannel }),
    ...(input.notes === undefined ? {} : { notes: input.notes }),
    ...(input.status === undefined ? {} : { status: input.status }),
  };
}

function toProjectWrite(input: CreateProjectInput | UpdateProjectInput) {
  return {
    ...(isCreateProject(input) ? { client_id: input.clientId } : {}),
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.summary === undefined ? {} : { summary: input.summary }),
    ...(input.budgetAmount === undefined
      ? {}
      : { budget_amount: input.budgetAmount }),
    ...(input.budgetCurrency === undefined
      ? {}
      : { budget_currency: input.budgetCurrency }),
    ...(input.dueDate === undefined ? {} : { due_date: input.dueDate }),
    ...(input.status === undefined ? {} : { status: input.status }),
  };
}

function isCreateProject(
  input: CreateProjectInput | UpdateProjectInput,
): input is CreateProjectInput {
  return "clientId" in input;
}

function throwIfDatabaseError(error: unknown, message: string): void {
  if (error !== null && error !== undefined) {
    throw databaseError(error, message);
  }
}

function requireData(data: unknown): Record<string, unknown> {
  if (typeof data !== "object" || data === null) {
    throw new BackendError({
      code: "internal_error",
      message: "The database returned no record",
      status: 500,
    });
  }
  return data as Record<string, unknown>;
}

function firstRow(data: unknown): Record<string, unknown> {
  const row = Array.isArray(data) ? data[0] : data;
  if (typeof row !== "object" || row === null) {
    throw new BackendError({
      code: "internal_error",
      message: "The database returned no record",
      status: 500,
    });
  }
  return row as Record<string, unknown>;
}
