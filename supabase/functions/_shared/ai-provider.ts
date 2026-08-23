import type { AIProvider } from "@clientflow/contracts";

import { BackendError } from "./errors.ts";
import {
  missingApiKeyError,
  QwenVisionAIProvider,
} from "./qwen-ai-provider.ts";

export interface ServerAIProvider extends AIProvider {
  readonly modelName: string;
  readonly providerName: string;
  extractScreenshot(input: {
    mimeType: string;
    imageBytes: Uint8Array;
  }): Promise<ServerAIProviderResult>;
}

export interface ServerAIProviderResult {
  result: unknown;
  usage: {
    attemptCount: number;
    inputTokens: number | null;
    outputTokens: number | null;
  };
}

export class ConfiguredStubAIProvider implements ServerAIProvider {
  readonly modelName = "configured-result-v1";
  readonly providerName = "stub";

  constructor(private readonly configuredResultJson: string | undefined) {}

  async extractScreenshot(): Promise<ServerAIProviderResult> {
    if (this.configuredResultJson === undefined) {
      throw new BackendError({
        code: "extraction_failed",
        message: "The AI provider stub is not configured",
        retryable: false,
        status: 503,
      });
    }

    try {
      return {
        result: JSON.parse(this.configuredResultJson) as unknown,
        usage: { attemptCount: 1, inputTokens: null, outputTokens: null },
      };
    } catch (error) {
      throw new BackendError({
        code: "extraction_failed",
        message: "The AI provider stub configuration is invalid",
        retryable: false,
        status: 503,
        cause: error,
      });
    }
  }
}

export function createServerAIProvider(
  getEnvironment: (name: string) => string | undefined,
): ServerAIProvider {
  const providerName = getEnvironment("AI_PROVIDER")?.trim().toLowerCase();
  if (providerName === undefined || providerName === "" || providerName === "stub") {
    return new ConfiguredStubAIProvider(
      getEnvironment("AI_PROVIDER_STUB_RESULT_JSON"),
    );
  }
  if (providerName === "qwen") {
    const apiKey = getEnvironment("DASHSCOPE_API_KEY");
    if (apiKey === undefined || apiKey.trim() === "") {
      throw missingApiKeyError();
    }
    return new QwenVisionAIProvider({ apiKey });
  }

  throw new BackendError({
    code: "internal_error",
    message: "Unsupported AI provider configuration",
    retryable: false,
    status: 500,
  });
}
