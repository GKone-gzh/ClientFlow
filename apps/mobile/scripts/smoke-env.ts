import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function loadSmokeEnvironment(fileNames: string[]): void {
  for (const fileName of fileNames) {
    const path = resolve(mobileRoot, fileName);
    if (existsSync(path)) {
      loadEnvFile(path);
    }
  }
}
