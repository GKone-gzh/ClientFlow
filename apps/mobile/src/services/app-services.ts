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

export interface AuthUser {
  id: string;
  email: string | null;
}

export interface AuthSession {
  user: AuthUser;
}

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface AuthSignUpResult {
  requiresEmailConfirmation: boolean;
  session: AuthSession | null;
  user: AuthUser;
}

export interface AuthService {
  getSession(): Promise<AuthSession | null>;
  onSessionChange(listener: (session: AuthSession | null) => void): () => void;
  signInWithPassword(credentials: AuthCredentials): Promise<AuthSession>;
  signOut(): Promise<void>;
  signUpWithPassword(credentials: AuthCredentials): Promise<AuthSignUpResult>;
  startAutoRefresh(): void;
  stopAutoRefresh(): void;
}

export interface AppServices {
  auth: AuthService;
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
  capabilities: {
    extraction: boolean;
  };
  services: AppServices;
  developmentTools: DevelopmentTools | null;
}
