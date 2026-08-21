import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

const workspaceRoot = process.env.CLIENTFLOW_WORKSPACE_ROOT
  ? resolve(process.env.CLIENTFLOW_WORKSPACE_ROOT)
  : resolve(import.meta.dirname, "..");
const mobileSource = resolve(workspaceRoot, "apps", "mobile", "src");

if (!existsSync(mobileSource)) {
  console.log("App boundary check: apps/mobile is not present on this baseline.");
  process.exit(0);
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!entry.isFile() || !/\.(?:ts|tsx)$/.test(entry.name)) return [];
    return [path];
  });
}

const violations = [];

for (const path of sourceFiles(mobileSource)) {
  if (!statSync(path).isFile()) continue;

  const source = readFileSync(path, "utf8");
  const normalizedPath = relative(mobileSource, path).split(sep).join("/");
  const isTestDouble =
    normalizedPath.startsWith("mocks/") ||
    normalizedPath.includes("/mock-") ||
    normalizedPath.endsWith(".test.ts") ||
    normalizedPath.endsWith(".test.tsx");
  const isFeatureOrStore =
    normalizedPath.startsWith("features/") || normalizedPath.startsWith("store/");

  if (
    isFeatureOrStore &&
    /from\s+["']@\/(?:mocks\/|[^"']*\/mock-)/.test(source)
  ) {
    violations.push(
      `${normalizedPath}: feature/store code must depend on contracts, not Mock implementations or Mock-only types.`,
    );
  }

  if (isTestDouble && /from\s+["']@\/services\/app-services["']/.test(source)) {
    violations.push(
      `${normalizedPath}: a test double must not import its composition root. Define the shared service shape in a neutral module.`,
    );
  }
}

if (violations.length > 0) {
  console.error("App dependency boundary violations:\n");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log("App dependency boundaries are valid.");
