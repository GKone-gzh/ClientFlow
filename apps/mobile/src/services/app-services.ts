import type {
  AIExtractionRepository,
  ClientRepository,
  IntakeService,
  ProjectRepository,
  RequirementRepository,
  TaskRepository,
  UploadRepository,
} from "@clientflow/contracts";

export interface AppServices {
  extractions: AIExtractionRepository;
  intake: IntakeService;
  clients: ClientRepository;
  projects: ProjectRepository;
  requirements: RequirementRepository;
  tasks: TaskRepository;
  uploads: UploadRepository;
}

export interface DevelopmentIntakeScenario {
  id: string;
  label: string;
}

export interface DevelopmentTools {
  intakeScenarios: readonly DevelopmentIntakeScenario[];
  selectIntakeScenario(id: string): void;
}

export interface AppServiceComposition {
  services: AppServices;
  developmentTools: DevelopmentTools | null;
}
