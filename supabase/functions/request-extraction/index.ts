import { serveEdgeFunction } from "../_shared/edge-runtime.ts";
import { createRequestExtractionHandler } from "../_shared/handlers.ts";

serveEdgeFunction(createRequestExtractionHandler);
