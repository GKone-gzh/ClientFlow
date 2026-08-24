export interface SafeLogEvent {
  attemptCount?: number;
  durationMs?: number;
  errorCode?: string;
  extractionId?: string;
  model?: string;
  operation: string;
  provider?: string;
  rateLimitDecision?: string;
  requestId: string;
  status: "failed" | "succeeded";
}

export interface SafeLogger {
  log(event: SafeLogEvent): void;
}

export function createSafeLogger(
  write: (serialized: string) => void = (serialized) =>
    console.info(serialized),
): SafeLogger {
  return {
    log(event) {
      const safeEvent: Record<string, string | number> = {
        operation: limitedString(event.operation),
        requestId: limitedString(event.requestId),
        status: event.status,
      };
      addString(safeEvent, "errorCode", event.errorCode);
      addString(safeEvent, "extractionId", event.extractionId);
      addString(safeEvent, "model", event.model);
      addString(safeEvent, "provider", event.provider);
      addString(safeEvent, "rateLimitDecision", event.rateLimitDecision);
      addNonnegativeInteger(safeEvent, "attemptCount", event.attemptCount);
      addNonnegativeInteger(safeEvent, "durationMs", event.durationMs);

      try {
        write(JSON.stringify(safeEvent));
      } catch {
        // Observability must never change the request outcome.
      }
    },
  };
}

export const edgeLogger = createSafeLogger();

function addString(
  target: Record<string, string | number>,
  key: string,
  value: string | undefined,
) {
  if (value !== undefined) target[key] = limitedString(value);
}

function addNonnegativeInteger(
  target: Record<string, string | number>,
  key: string,
  value: number | undefined,
) {
  if (Number.isSafeInteger(value) && Number(value) >= 0) {
    target[key] = Number(value);
  }
}

function limitedString(value: string) {
  return value.slice(0, 128);
}
