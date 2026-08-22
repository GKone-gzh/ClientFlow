import { serveEdgeFunction } from "../_shared/edge-runtime.ts";
import { createConfirmExtractionHandler } from "../_shared/handlers.ts";

serveEdgeFunction(createConfirmExtractionHandler);
