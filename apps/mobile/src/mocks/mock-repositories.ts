import type {
  Client,
  ClientRepository,
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

import {
  MOCK_CLIENTS,
  MOCK_PROJECTS,
  MOCK_REQUIREMENTS,
  MOCK_TASKS,
  MOCK_USER_ID,
} from "./mock-data";

const MOCK_DELAY_MS = 120;
let idSequence = 100;

function nextId() {
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
}

class MockClientRepository implements ClientRepository {
  constructor(private readonly store: MockRepositoryStore) {}

  async list() {
    await simulateLatency();
    return this.store.clients.map((client) => ({ ...client }));
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
      id: nextId(),
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

  async listByClient(clientId: EntityId) {
    await simulateLatency();
    return this.store.projects
      .filter((project) => project.clientId === clientId)
      .map((project) => ({ ...project }));
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
      id: nextId(),
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
    await simulateLatency();
    return this.store.requirements
      .filter((requirement) => requirement.projectId === projectId)
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((requirement): Requirement => ({ ...requirement }));
  }
}

class MockTaskRepository implements TaskRepository {
  constructor(private readonly store: MockRepositoryStore) {}

  async listByProject(projectId: EntityId) {
    await simulateLatency();
    return this.store.tasks
      .filter((task) => task.projectId === projectId)
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((task): Task => ({ ...task }));
  }
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
