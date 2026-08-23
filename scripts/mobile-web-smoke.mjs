import { existsSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const workspaceRoot = process.env.CLIENTFLOW_WORKSPACE_ROOT
  ? resolve(process.env.CLIENTFLOW_WORKSPACE_ROOT)
  : resolve(import.meta.dirname, "..");
const mobilePackage = resolve(workspaceRoot, "apps", "mobile", "package.json");
const outputDirectory = resolve(workspaceRoot, "apps", "mobile", "dist-web");
const allowMissing = process.argv.includes("--allow-missing");
const keepOutput = process.argv.includes("--keep-output");

if (!existsSync(mobilePackage)) {
  if (allowMissing) {
    console.log("Mobile web build: apps/mobile is not present on this baseline.");
    process.exit(0);
  }
  console.error("Mobile web smoke requires apps/mobile/package.json.");
  process.exit(1);
}

rmSync(outputDirectory, { force: true, recursive: true });

const pnpmArguments = [
  "--filter",
  "@clientflow/mobile",
  "exec",
  "expo",
  "export",
  "--platform",
  "web",
  "--output-dir",
  "dist-web",
];
const isWindows = process.platform === "win32";
const command = isWindows ? (process.env.ComSpec ?? "cmd.exe") : "pnpm";
const commandArguments = isWindows
  ? ["/d", "/s", "/c", `pnpm ${pnpmArguments.join(" ")}`]
  : pnpmArguments;
const result = spawnSync(command, commandArguments, {
  cwd: workspaceRoot,
  encoding: "utf8",
  env: {
    ...process.env,
    CI: "1",
    EXPO_PUBLIC_APP_ADAPTER: "supabase",
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_build_smoke",
    EXPO_PUBLIC_SUPABASE_URL: "https://build-smoke.supabase.co",
  },
  stdio: "inherit",
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const indexPath = resolve(outputDirectory, "index.html");
if (!existsSync(indexPath)) {
  console.error(`Mobile web export did not create ${indexPath}.`);
  process.exit(1);
}

console.log(`Mobile web smoke verified ${indexPath}.`);
if (!keepOutput) rmSync(outputDirectory, { force: true, recursive: true });
