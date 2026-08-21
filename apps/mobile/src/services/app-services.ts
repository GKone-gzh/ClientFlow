import type {
  AIExtractionRepository,
  ClientRepository,
  IntakeService,
  PrepareUploadResult,
  ProjectRepository,
  RequirementRepository,
  TaskRepository,
  UploadRepository,
} from "@clientflow/contracts";

export interface ScreenshotUploadFile {
  uri: string;
  mimeType: string;
  byteSize: number;
}

export interface ScreenshotUploadTransport {
  upload(input: {
    prepared: PrepareUploadResult;
    file: ScreenshotUploadFile;
  }): Promise<void>;
}

export interface AppServices {
  extractions: AIExtractionRepository;
  intake: IntakeService;
  clients: ClientRepository;
  projects: ProjectRepository;
  requirements: RequirementRepository;
  screenshotUpload: ScreenshotUploadTransport;
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
