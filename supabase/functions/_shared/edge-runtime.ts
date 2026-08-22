import type { BackendFactory } from "./handlers.ts";
import { createRuntimeBackendFactory } from "./runtime.ts";

interface DenoRuntime {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
}

export function serveEdgeFunction(
  createHandler: (
    createBackend: BackendFactory,
  ) => (request: Request) => Promise<Response>,
): void {
  const deno = (globalThis as typeof globalThis & { Deno: DenoRuntime }).Deno;
  const backend = createRuntimeBackendFactory((name) => deno.env.get(name));
  deno.serve(createHandler(backend));
}
