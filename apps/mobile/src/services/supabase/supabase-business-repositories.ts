import {
  ClientSchema,
  EntityIdSchema,
  ProjectSchema,
  RequirementSchema,
  TaskSchema,
  type Client,
  type ClientRepository,
  type CreateClientInput,
  type CreateProjectInput,
  type EntityId,
  type Project,
  type ProjectRepository,
  type Requirement,
  type RequirementRepository,
  type Task,
  type TaskRepository,
  type UpdateClientInput,
  type UpdateProjectInput,
} from "@clientflow/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";

import { AppServiceError } from "@/services/service-error";
import {
  databaseError,
  requireSupabaseSession,
} from "@/services/supabase/supabase-adapter-utils";

const RECORD_LIMIT = 200;
const CLIENT_COLUMNS =
  "id,user_id,name,contact_handle,contact_channel,notes,status,created_at,updated_at";
const PROJECT_COLUMNS =
  "id,user_id,client_id,name,summary,budget_amount,budget_currency,due_date,status,created_at,updated_at";
const REQUIREMENT_COLUMNS =
  "id,user_id,project_id,content,sort_order,source_extraction_id,created_at,updated_at";
const TASK_COLUMNS =
  "id,user_id,project_id,requirement_id,title,description,due_at,sort_order,status,created_at,updated_at";

interface RuntimeSchema<Output> {
  safeParse(value: unknown):
    | { data: Output; success: true }
    | { error: unknown; success: false };
}

export function createSupabaseBusinessRepositories(client: SupabaseClient) {
  return {
    clients: new SupabaseClientRepository(client),
    projects: new SupabaseProjectRepository(client),
    requirements: new SupabaseRequirementRepository(client),
    tasks: new SupabaseTaskRepository(client),
  };
}

export class SupabaseClientRepository implements ClientRepository {
  constructor(private readonly client: SupabaseClient) {}

  async list(): Promise<Client[]> {
    await requireSupabaseSession(this.client);
    const { data, error } = await this.client
      .from("clients")
      .select(CLIENT_COLUMNS)
      .order("updated_at", { ascending: false })
      .limit(RECORD_LIMIT);
    throwIfDatabaseError(error, "无法读取客户列表，请稍后重试。");
    return parseRows(data, mapClientRow, "客户服务返回了无效记录。");
  }

  async getById(id: EntityId): Promise<Client | null> {
    requireId(id);
    await requireSupabaseSession(this.client);
    const { data, error } = await this.client
      .from("clients")
      .select(CLIENT_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    throwIfDatabaseError(error, "无法读取客户详情，请稍后重试。");
    return data === null ? null : mapClientRow(data);
  }

  async create(input: CreateClientInput): Promise<Client> {
    await requireSupabaseSession(this.client);
    const { data, error } = await this.client
      .from("clients")
      .insert(toClientWrite(input))
      .select(CLIENT_COLUMNS)
      .single();
    throwIfDatabaseError(error, "无法创建客户，请稍后重试。");
    return mapClientRow(requireRow(data));
  }

  async update(id: EntityId, input: UpdateClientInput): Promise<Client> {
    requireId(id);
    await requireSupabaseSession(this.client);
    const { data, error } = await this.client
      .from("clients")
      .update(toClientWrite(input))
      .eq("id", id)
      .select(CLIENT_COLUMNS)
      .single();
    throwIfDatabaseError(error, "无法更新客户，请稍后重试。");
    return mapClientRow(requireRow(data));
  }
}

export class SupabaseProjectRepository implements ProjectRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listByClient(clientId: EntityId): Promise<Project[]> {
    requireId(clientId);
    await requireSupabaseSession(this.client);
    const { data, error } = await this.client
      .from("projects")
      .select(PROJECT_COLUMNS)
      .eq("client_id", clientId)
      .order("updated_at", { ascending: false })
      .limit(RECORD_LIMIT);
    throwIfDatabaseError(error, "无法读取客户项目，请稍后重试。");
    return parseRows(data, mapProjectRow, "项目服务返回了无效记录。");
  }

  async getById(id: EntityId): Promise<Project | null> {
    requireId(id);
    await requireSupabaseSession(this.client);
    const { data, error } = await this.client
      .from("projects")
      .select(PROJECT_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    throwIfDatabaseError(error, "无法读取项目详情，请稍后重试。");
    return data === null ? null : mapProjectRow(data);
  }

  async create(input: CreateProjectInput): Promise<Project> {
    await requireSupabaseSession(this.client);
    const { data, error } = await this.client
      .from("projects")
      .insert(toProjectWrite(input))
      .select(PROJECT_COLUMNS)
      .single();
    throwIfDatabaseError(error, "无法创建项目，请稍后重试。");
    return mapProjectRow(requireRow(data));
  }

  async update(id: EntityId, input: UpdateProjectInput): Promise<Project> {
    requireId(id);
    await requireSupabaseSession(this.client);
    const { data, error } = await this.client
      .from("projects")
      .update(toProjectWrite(input))
      .eq("id", id)
      .select(PROJECT_COLUMNS)
      .single();
    throwIfDatabaseError(error, "无法更新项目，请稍后重试。");
    return mapProjectRow(requireRow(data));
  }
}

export class SupabaseRequirementRepository implements RequirementRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listByProject(projectId: EntityId): Promise<Requirement[]> {
    requireId(projectId);
    await requireSupabaseSession(this.client);
    const { data, error } = await this.client
      .from("requirements")
      .select(REQUIREMENT_COLUMNS)
      .eq("project_id", projectId)
      .order("sort_order")
      .limit(RECORD_LIMIT);
    throwIfDatabaseError(error, "无法读取项目需求，请稍后重试。");
    return parseRows(data, mapRequirementRow, "需求服务返回了无效记录。");
  }
}

export class SupabaseTaskRepository implements TaskRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listByProject(projectId: EntityId): Promise<Task[]> {
    requireId(projectId);
    await requireSupabaseSession(this.client);
    const { data, error } = await this.client
      .from("tasks")
      .select(TASK_COLUMNS)
      .eq("project_id", projectId)
      .order("sort_order")
      .limit(RECORD_LIMIT);
    throwIfDatabaseError(error, "无法读取项目任务，请稍后重试。");
    return parseRows(data, mapTaskRow, "任务服务返回了无效记录。");
  }
}

function mapClientRow(row: Record<string, unknown>): Client {
  return parseModel(ClientSchema, {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    contactHandle: row.contact_handle,
    contactChannel: row.contact_channel,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapProjectRow(row: Record<string, unknown>): Project {
  return parseModel(ProjectSchema, {
    id: row.id,
    userId: row.user_id,
    clientId: row.client_id,
    name: row.name,
    summary: row.summary,
    budgetAmount: row.budget_amount === null ? null : Number(row.budget_amount),
    budgetCurrency: row.budget_currency,
    dueDate: row.due_date,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapRequirementRow(row: Record<string, unknown>): Requirement {
  return parseModel(RequirementSchema, {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    content: row.content,
    sortOrder: Number(row.sort_order),
    sourceExtractionId: row.source_extraction_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapTaskRow(row: Record<string, unknown>): Task {
  return parseModel(TaskSchema, {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    requirementId: row.requirement_id,
    title: row.title,
    description: row.description,
    dueAt: row.due_at,
    sortOrder: Number(row.sort_order),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function parseModel<T>(schema: RuntimeSchema<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AppServiceError(
      "internal_error",
      "数据库返回了无效的业务记录。",
      true,
    );
  }
  return parsed.data;
}

function parseRows<T>(
  data: unknown,
  mapper: (row: Record<string, unknown>) => T,
  message: string,
): T[] {
  if (!Array.isArray(data)) {
    throw new AppServiceError("internal_error", message, true);
  }
  return data.map((row) => mapper(requireRow(row)));
}

function requireRow(data: unknown): Record<string, unknown> {
  if (typeof data !== "object" || data === null) {
    throw new AppServiceError(
      "internal_error",
      "数据库没有返回预期记录。",
      true,
    );
  }
  return data as Record<string, unknown>;
}

function requireId(id: EntityId): void {
  if (!EntityIdSchema.safeParse(id).success) {
    throw new AppServiceError("validation_failed", "记录标识无效。", false);
  }
}

function throwIfDatabaseError(error: unknown, message: string): void {
  if (error !== null && error !== undefined) {
    throw databaseError(error, message);
  }
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
