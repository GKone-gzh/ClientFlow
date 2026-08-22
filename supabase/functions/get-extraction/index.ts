import { serveEdgeFunction } from "../_shared/edge-runtime.ts";
import { createGetExtractionHandler } from "../_shared/handlers.ts";

serveEdgeFunction(createGetExtractionHandler);
