import {
  AIExtractionResultSchema,
  type AIExtraction,
  type AIExtractionRepository,
  type ConfirmExtractionInput,
  type ConfirmExtractionResult,
  type IntakeService,
  type PrepareUploadInput,
  type Requirement,
  type Task,
  type Upload,
  type UploadRepository,
} from "@clientflow/contracts";

import { MOCK_USER_ID } from "./mock-data";
import { MockRepositoryStore, nextMockId } from "./mock-repositories";
import {
  MockAIProvider,
  createMockAIController,
  mockScenarioBytes,
  type MockAIController,
} from "@/services/ai/mock-ai-provider";
import type { AppServices } from "@/services/app-services";
import { AppServiceError } from "@/services/service-error";

const MOCK_PROVIDER = "mock";
const MOCK_MODEL = "mock-v1";

function now() {
  return new Date().toISOString();
}

class MockUploadRepository implements UploadRepository {
  constructor(private readonly store: MockRepositoryStore) {}

  async getById(id: string) {
    const upload = this.store.uploads.find((candidate) => candidate.id === id);
    return upload ? { ...upload } : null;
  }

  async prepare(input: PrepareUploadInput) {
    const timestamp = now();
    const uploadId = nextMockId();
    const upload: Upload = {
      id: uploadId,
      userId: MOCK_USER_ID,
      storagePath: `${MOCK_USER_ID}/${uploadId}/source`,
      mimeType: input.mimeType,
      byteSize: input.byteSize,
      status: "pending",
      errorCode: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.store.uploads.push(upload);
    this.store.uploadFileNames.set(uploadId, input.originalFileName);
    return {
      uploadId,
      storagePath: upload.storagePath,
      signedUploadToken: `mock-token-${uploadId}`,
    };
  }

  async markUploaded(id: string) {
    const upload = this.store.uploads.find((candidate) => candidate.id === id);
    if (!upload) {
      throw new AppServiceError("not_found", "Upload not found", false);
    }
    upload.status = "uploaded";
    upload.updatedAt = now();
    return { ...upload };
  }
}

class MockAIExtractionRepository implements AIExtractionRepository {
  constructor(
    private readonly store: MockRepositoryStore,
    private readonly provider: MockAIProvider,
  ) {}

  async getById(id: string) {
    const extraction = this.store.extractions.find((candidate) => candidate.id === id);
    return extraction ? { ...extraction } : null;
  }

  async start(uploadId: string) {
    const upload = this.store.uploads.find((candidate) => candidate.id === uploadId);
    if (!upload) {
      throw new AppServiceError("not_found", "Upload not found", false);
    }
    const existing = [...this.store.extractions]
      .reverse()
      .find((candidate) => candidate.uploadId === uploadId);
    if (existing && existing.status !== "failed") {
      return { ...existing };
    }
    if (upload.status === "failed" && existing?.status === "failed") {
      upload.status = "uploaded";
      upload.errorCode = null;
    } else if (upload.status !== "uploaded") {
      throw new AppServiceError("conflict", "Upload is not ready", false);
    }

    const timestamp = now();
    const extraction: AIExtraction = {
      id: nextMockId(),
      userId: MOCK_USER_ID,
      uploadId,
      status: "processing",
      schemaVersion: 1,
      provider: MOCK_PROVIDER,
      model: MOCK_MODEL,
      result: null,
      errorCode: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.store.extractions.push(extraction);
    upload.status = "processing";

    try {
      const unknownResult = await this.provider.extractScreenshot({
        mimeType: upload.mimeType,
        imageBytes: mockScenarioBytes("complete"),
      });
      const parsed = AIExtractionResultSchema.safeParse(unknownResult);
      if (!parsed.success) {
        extraction.status = "failed";
        extraction.errorCode = "validation_failed";
        upload.status = "failed";
        upload.errorCode = "validation_failed";
      } else {
        extraction.status = "needs_review";
        extraction.result = parsed.data;
        upload.status = "completed";
      }
    } catch {
      extraction.status = "failed";
      extraction.errorCode = "extraction_failed";
      upload.status = "failed";
      upload.errorCode = "extraction_failed";
    }

    extraction.updatedAt = now();
    upload.updatedAt = extraction.updatedAt;
    return { ...extraction };
  }
}

class MockIntakeService implements IntakeService {
  constructor(
    private readonly store: MockRepositoryStore,
    private readonly services: Pick<AppServices, "clients" | "projects">,
    private readonly extractions: AIExtractionRepository,
  ) {}

  requestExtraction(uploadId: string) {
    return this.extractions.start(uploadId);
  }

  async getValidatedResult(extractionId: string) {
    const extraction = await this.extractions.getById(extractionId);
    if (!extraction) {
      throw new AppServiceError("not_found", "Extraction not found", false);
    }
    if (extraction.status === "failed") {
      const code = extraction.errorCode === "validation_failed" ? "validation_failed" : "extraction_failed";
      throw new AppServiceError(code, "Extraction failed", true);
    }
    if (!extraction.result) {
      return null;
    }

    const parsed = AIExtractionResultSchema.safeParse(extraction.result);
    if (!parsed.success) {
      throw new AppServiceError(
        "validation_failed",
        "Invalid extraction result",
        true,
      );
    }
    return parsed.data;
  }

  async confirm(input: ConfirmExtractionInput): Promise<ConfirmExtractionResult> {
    const existing = this.store.confirmations.get(input.extractionId);
    if (existing) {
      return { ...existing };
    }

    const extraction = this.store.extractions.find(
      (candidate) => candidate.id === input.extractionId,
    );
    if (!extraction) {
      throw new AppServiceError("not_found", "Extraction not found", false);
    }
    if (extraction.status !== "needs_review") {
      throw new AppServiceError(
        "conflict",
        "Extraction cannot be confirmed",
        false,
      );
    }

    const parsed = AIExtractionResultSchema.safeParse(input.result);
    if (!parsed.success) {
      throw new AppServiceError(
        "validation_failed",
        "Review result is invalid",
        false,
      );
    }
    const result = parsed.data;
    const client = await this.services.clients.create({
      name: result.client.name,
      contactHandle: result.client.contactHandle,
      contactChannel: result.client.contactChannel,
      notes: null,
      status: "lead",
    });
    const project = await this.services.projects.create({
      clientId: client.id,
      name: result.project.name,
      summary: result.project.summary,
      budgetAmount: result.project.budgetAmount,
      budgetCurrency: result.project.budgetCurrency,
      dueDate: result.project.dueDate,
      status: "draft",
    });

    const timestamp = now();
    const requirements = result.requirements.map((candidate): Requirement => ({
      id: nextMockId(),
      userId: MOCK_USER_ID,
      projectId: project.id,
      content: candidate.content,
      sortOrder: candidate.sortOrder,
      sourceExtractionId: extraction.id,
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
    const tasks = result.suggestedTasks.map((candidate): Task => ({
      id: nextMockId(),
      userId: MOCK_USER_ID,
      projectId: project.id,
      requirementId:
        candidate.requirementIndex === null
          ? null
          : (requirements[candidate.requirementIndex]?.id ?? null),
      title: candidate.title,
      description: candidate.description,
      dueAt: result.project.dueDate
        ? `${result.project.dueDate}T23:59:00.000Z`
        : null,
      sortOrder: candidate.sortOrder,
      status: "todo",
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
    this.store.requirements.push(...requirements);
    this.store.tasks.push(...tasks);

    const confirmed: ConfirmExtractionResult = {
      clientId: client.id,
      projectId: project.id,
      requirementIds: requirements.map((requirement) => requirement.id),
      taskIds: tasks.map((task) => task.id),
    };
    extraction.status = "confirmed";
    extraction.result = result;
    extraction.updatedAt = timestamp;
    this.store.confirmations.set(input.extractionId, confirmed);
    return { ...confirmed };
  }
}

export interface MockIntakeServices {
  controller: MockAIController;
  extractions: AIExtractionRepository;
  intake: IntakeService;
  uploads: UploadRepository;
}

export function createMockIntakeServices(
  store: MockRepositoryStore,
  services: Pick<AppServices, "clients" | "projects">,
): MockIntakeServices {
  const controller = createMockAIController();
  const uploads = new MockUploadRepository(store);
  const extractions = new MockAIExtractionRepository(
    store,
    new MockAIProvider(controller),
  );
  return {
    controller,
    uploads,
    extractions,
    intake: new MockIntakeService(store, services, extractions),
  };
}
