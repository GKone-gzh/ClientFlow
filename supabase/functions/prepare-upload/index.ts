import { serveEdgeFunction } from "../_shared/edge-runtime.ts";
import { createPrepareUploadHandler } from "../_shared/handlers.ts";

serveEdgeFunction(createPrepareUploadHandler);
