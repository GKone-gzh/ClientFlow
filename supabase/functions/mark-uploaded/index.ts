import { serveEdgeFunction } from "../_shared/edge-runtime.ts";
import { createMarkUploadedHandler } from "../_shared/handlers.ts";

serveEdgeFunction(createMarkUploadedHandler);
