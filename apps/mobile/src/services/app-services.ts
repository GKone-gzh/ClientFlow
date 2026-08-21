import type {
  AIExtractionRepository,
  ClientRepository,
  IntakeService,
  ProjectRepository,
  RequirementRepository,
  TaskRepository,
  UploadRepository,
} from "@clientflow/contracts";

import { createMockIntakeServices } from "@/mocks/mock-intake-services";
import { createMockRepositories } from "@/mocks/mock-repositories";

export interface AppServices {
  extractions: AIExtractionRepository;
  intake: IntakeService;
  clients: ClientRepository;
  projects: ProjectRepository;
  requirements: RequirementRepository;
  tasks: TaskRepository;
  uploads: UploadRepository;
}

const mockRepositories = createMockRepositories();
const mockIntakeServices = createMockIntakeServices(
  mockRepositories.store,
  mockRepositories,
);

export const appServices: AppServices = {
  ...mockRepositories,
  ...mockIntakeServices,
};
export const mockStore = mockRepositories.store;
