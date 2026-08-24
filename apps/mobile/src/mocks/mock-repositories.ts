import {
  CLIENT_PAGE_SIZE,
  CursorPageRequestSchema,
  EntityIdSchema,
  ListTasksInputSchema,
  MAX_PROJECT_BATCH_SIZE,
  PROJECT_PAGE_SIZE,
  TASK_PAGE_SIZE,
  decodeTimestampPageCursor,
  encodeTimestampPageCursor,
  type AIExtraction,
  type Client,
  type ClientRepository,
  type ConfirmExtractionResult,
  type CreateClientInput,
  type CreateProjectInput,
  type CursorPage,
  type CursorPageRequest,
  type EntityId,
  type ListTasksInput,
  type Project,
  type ProjectRepository,
  type Requirement,
  type RequirementRepository,
  type Task,
  type TaskRepository,
  type UpdateClientInput,
  type UpdateProjectInput,
  type Upload,
} from "@clientflow/contracts";

import { AppServiceError } from "@/services/service-error";

import {
  MOCK_CLIENTS,
  MOCK_PROJECTS,
  MOCK_REQUIREMENTS,
  MOCK_TASKS,
  MOCK_USER_ID,
} from "./mock-data";

const MOCK_DELAY_MS = 120;
let idSequence = 100;

export function nextMockId() {
  idSequence += 1;
  return `90000000-0000-4000-8000-${String(idSequence).padStart(12, "0")}`;
}

async function simulateLatency() {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS));
}

function now() {
  return new Date().toISOString();
}

export class MockRepositoryStore {
  readonly clients = MOCK_CLIENTS.map((client) => ({ ...client }));
  readonly projects = MOCK_PROJECTS.map((project) => ({ ...project }));
  readonly requirements = MOCK_REQUIREMENTS.map((requirement) => ({ ...requirement }));
  readonly tasks = MOCK_TASKS.map((task) => ({ ...task }));
  readonly uploads: Upload[] = [];
  readonly uploadFileNames = new Map<EntityId, string>();
  readonly extractions: AIExtraction[] = [];
  readonly confirmations = new Map<EntityId, ConfirmExtractionResult>();
}

class MockClientRepository implements ClientRepository {
  constructor(private readonly store: MockRepositoryStore) {}

  async list(input?: CursorPageRequest): Promise<CursorPage<Client>> {
    await simulateLatency();
    return paginateByTimestamp(
      this.store.clients,
      input,
      CLIENT_PAGE_SIZE,
      "updated_at",
    );
  }

  async getById(id: EntityId) {
    await simulateLatency();
    const client = this.store.clients.find((candidate) => candidate.id === id);
    return client ? { ...client } : null;
  }

  async create(input: CreateClientInput) {
    await simulateLatency();
    const timestamp = now();
    const client: Client = {
      ...input,
      id: nextMockId(),
      userId: MOCK_USER_ID,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.store.clients.unshift(client);
    return { ...client };
  }

  async update(id: EntityId, input: UpdateClientInput) {
    await simulateLatency();
    const index = this.store.clients.findIndex((client) => client.id === id);
    const current = this.store.clients[index];
    if (!current) {
      throw new Error("Client not found");
    }

    const updated: Client = { ...current, ...input, updatedAt: now() };
    this.store.clients[index] = updated;
    return { ...updated };
  }
}

class MockProjectRepository implements ProjectRepository {
  constructor(private readonly store: MockRepositoryStore) {}

  async listByClient(clientId: EntityId, input?: CursorPageRequest) {
    await simulateLatency();
    requireId(clientId);
    return paginateByTimestamp(
      this.store.projects.filter((project) => project.clientId === clientId),
      input,
      PROJECT_PAGE_SIZE,
      "updated_at",
    );
  }

  async getById(id: EntityId) {
    await simulateLatency();
    const project = this.store.projects.find((candidate) => candidate.id === id);
    return project ? { ...project } : null;
  }

  async create(input: CreateProjectInput) {
    await simulateLatency();
    const timestamp = now();
    const project: Project = {
      ...input,
      id: nextMockId(),
      userId: MOCK_USER_ID,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.store.projects.unshift(project);
    return { ...project };
  }

  async update(id: EntityId, input: UpdateProjectInput) {
    await simulateLatency();
    const index = this.store.projects.findIndex((project) => project.id === id);
    const current = this.store.projects[index];
    if (!current) {
      throw new Error("Project not found");
    }

    const updated: Project = { ...current, ...input, updatedAt: now() };
    this.store.projects[index] = updated;
    return { ...updated };
  }
}

class MockRequirementRepository implements RequirementRepository {
  constructor(private readonly store: MockRepositoryStore) {}

  async listByProject(projectId: EntityId) {
    return this.listByProjectIds([projectId]);
  }

  async listByProjectIds(projectIds: readonly EntityId[]) {
    await simulateLatency();
    const ids = new Set(requireProjectIds(projectIds));
    return this.store.requirements
      .filter((requirement) => ids.has(requirement.projectId))
      .sort(compareProjectChildren)
      .map((requirement): Requirement => ({ ...requirement }));
  }
}

class MockTaskRepository implements TaskRepository {
  constructor(private readonly store: MockRepositoryStore) {}

  async list(input?: ListTasksInput): Promise<CursorPage<Task>> {
    await simulateLatency();
    const parsed = ListTasksInputSchema.safeParse(input ?? {});
    if (!parsed.success) throwValidation("任务分页参数无效。");
    return paginateByTimestamp(
      this.store.tasks.filter(
        (task) => !parsed.data.status || task.status === parsed.data.status,
      ),
      { cursor: parsed.data.cursor, limit: parsed.data.limit },
      TASK_PAGE_SIZE,
      "created_at",
    );
  }

  async listByProject(projectId: EntityId) {
    return this.listByProjectIds([projectId]);
  }

  async listByProjectIds(projectIds: readonly EntityId[]) {
    await simulateLatency();
    const ids = new Set(requireProjectIds(projectIds));
    return this.store.tasks
      .filter((task) => ids.has(task.projectId))
      .sort(compareProjectChildren)
      .map((task): Task => ({ ...task }));
  }
}

interface TimestampedEntity {
  createdAt: string;
  id: EntityId;
  updatedAt: string;
}

function paginateByTimestamp<T extends TimestampedEntity>(
  source: readonly T[],
  input: CursorPageRequest | undefined,
  defaultLimit: number,
  sort: "created_at" | "updated_at",
): CursorPage<T> {
  const parsed = CursorPageRequestSchema.safeParse(input ?? {});
  if (!parsed.success) throwValidation("分页参数无效。");
  const cursor = parsed.data.cursor
    ? decodeTimestampPageCursor(parsed.data.cursor)
    : null;
  if (parsed.data.cursor && (!cursor || cursor.sort !== sort)) {
    throwValidation("分页游标无效。");
  }
  const timestamp = (item: T) =>
    sort === "created_at" ? item.createdAt : item.updatedAt;
  const ordered = source
    .filter(
      (item) =>
        !cursor ||
        timestamp(item) < cursor.timestamp ||
        (timestamp(item) === cursor.timestamp && item.id < cursor.id),
    )
    .toSorted(
      (left, right) =>
        timestamp(right).localeCompare(timestamp(left)) ||
        right.id.localeCompare(left.id),
    );
  const limit = parsed.data.limit ?? defaultLimit;
  const items = ordered.slice(0, limit).map((item) => ({ ...item }));
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      ordered.length > limit && last
        ? encodeTimestampPageCursor({
            version: 1,
            sort,
            timestamp: timestamp(last),
            id: last.id,
          })
        : null,
  };
}

function compareProjectChildren(
  left: Requirement | Task,
  right: Requirement | Task,
) {
  return (
    left.projectId.localeCompare(right.projectId) ||
    left.sortOrder - right.sortOrder ||
    left.id.localeCompare(right.id)
  );
}

function requireProjectIds(projectIds: readonly EntityId[]): EntityId[] {
  if (projectIds.length > MAX_PROJECT_BATCH_SIZE) {
    throwValidation("批量项目数量超过限制。");
  }
  const ids = [...new Set(projectIds)];
  if (ids.some((id) => !EntityIdSchema.safeParse(id).success)) {
    throwValidation("记录标识无效。");
  }
  return ids;
}

function requireId(id: EntityId): void {
  if (!EntityIdSchema.safeParse(id).success) {
    throwValidation("记录标识无效。");
  }
}

function throwValidation(message: string): never {
  throw new AppServiceError("validation_failed", message, false);
}

export interface MockRepositories {
  clients: ClientRepository;
  projects: ProjectRepository;
  requirements: RequirementRepository;
  store: MockRepositoryStore;
  tasks: TaskRepository;
}

export function createMockRepositories(): MockRepositories {
  const store = new MockRepositoryStore();
  return {
    clients: new MockClientRepository(store),
    projects: new MockProjectRepository(store),
    requirements: new MockRequirementRepository(store),
    store,
    tasks: new MockTaskRepository(store),
  };
}
