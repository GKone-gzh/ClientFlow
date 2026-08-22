import type { AIProvider } from "@clientflow/contracts";

import { BackendError } from "./errors.ts";

export interface ServerAIProvider extends AIProvider {
  readonly modelName: string;
  readonly providerName: string;
}

export class ConfiguredStubAIProvider implements ServerAIProvider {
  readonly modelName = "configured-result-v1";
  readonly providerName = "stub";

  constructor(private readonly configuredResultJson: string | undefined) {}

  async extractScreenshot(): Promise<unknown> {
    if (this.configuredResultJson === undefined) {
      throw new BackendError({
        code: "extraction_failed",
        message: "The AI provider stub is not configured",
        retryable: false,
        status: 503,
      });
    }

    try {
      return JSON.parse(this.configuredResultJson) as unknown;
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
