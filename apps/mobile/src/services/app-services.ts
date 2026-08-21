import type {
  ClientRepository,
  ProjectRepository,
  RequirementRepository,
  TaskRepository,
} from "@clientflow/contracts";

import { createMockRepositories } from "@/mocks/mock-repositories";

export interface AppServices {
  clients: ClientRepository;
  projects: ProjectRepository;
  requirements: RequirementRepository;
  tasks: TaskRepository;
}

const mockRepositories = createMockRepositories();

export const appServices: AppServices = mockRepositories;
export const mockStore = mockRepositories.store;
